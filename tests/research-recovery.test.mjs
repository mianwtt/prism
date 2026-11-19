import test from 'node:test';
import assert from 'node:assert/strict';
import {runGeneralResearch} from '../src/general-research.mjs';
import {evaluateDecision} from '../src/decision-schema.mjs';
import {observedResearchLinks,recoverResearch} from '../src/research-recovery.mjs';
import {recoveryCases,recoveryFixture} from './fixtures/recovery-cases.mjs';
import {parseMerchantDetail} from '../src/public-merchant-read.mjs';

test('an initially timed-out city catalog can be retried by recovery with the declared location input',async()=>{
 const fixture=recoveryFixture({domain:'rental',mode:'queries',initial:0}),base=fixture.io.model;let catalogs=0;
 fixture.io.publicCatalogs=[{platform:'fang-rentals',input:'location'}];
 fixture.io.searchCatalog=async request=>{assert.equal(request.location,'杭州');if(++catalogs<=2)throw new Error('房源读取超时');return {url:'https://m.fang.com/zf/hz/',text:'构造目录',observedLinks:fixture.records.slice(0,3).map(r=>({url:r.url,title:r.name}))};};
 fixture.io.model=async messages=>{
   const prompt=messages[0].content;
   if(prompt.startsWith('Analyze this individual'))return {...await base(messages),catalogRequests:[{platform:'fang-rentals',location:'杭州'}]};
   if(prompt.startsWith('The first sources')){assert(prompt.includes('location'));return {queries:[],catalogRequests:[{platform:'fang-rentals',location:'杭州'}]};}
   if(prompt.startsWith('Choose up to 6'))return {urls:JSON.parse(messages[1].content).links.map(l=>l.url)};
   return base(messages);
 };
 const result=await runGeneralResearch(fixture.question,fixture.io);
 assert.equal(catalogs,3);assert.equal(result.agent.recovery.calls.catalog,1);assert.equal(result.agent.recovery.after.comparable,3);
 assert.equal(result.candidates.length,3);assert(!result.trace.some(t=>t.message.includes('undefined')));
});

for(const invalid of [{catalogRequests:[]},{keywords:'轻量设备1.6kg'},{keywords:'最初类别'}])test('compact catalog repair rejects '+(invalid.keywords==='最初类别'?'already observed requests':invalid.keywords?'numeric weight queries':'empty choices')+' without spending extra discovery budget',async()=>{
 const fixture=recoveryFixture({domain:'computer',mode:'queries',initial:0}),base=fixture.io.model;let catalogs=0,repairs=0;
 fixture.records.forEach((r,i)=>{r.url='https://m.suning.com/product/0000000000/'+(123456780+i)+'.html';});
 fixture.io.publicCatalogs=[{platform:'suning',input:'keywords'}];
 fixture.io.searchCatalog=async request=>{catalogs++;const chosen=request.keywords==='最初类别'?fixture.records.slice(0,2):fixture.records.slice(2,5);return {url:'https://search.suning.com/'+encodeURIComponent(request.keywords)+'/',text:'构造目录',observedLinks:chosen.map(r=>({url:r.url,title:r.name}))};};
 fixture.io.model=async messages=>{
   const prompt=messages[0].content;
   if(prompt.startsWith('Analyze this individual'))return {...await base(messages),catalogRequests:[{platform:'suning',keywords:'最初类别'}]};
   if(prompt.startsWith('Choose ONE alternative')){repairs++;if(repairs>1){const feedback=JSON.parse(messages[1].content).validationFeedback;assert.ok(Array.isArray(feedback?.rejectedRequests));assert.match(feedback.reason,/DIFFERENT/);}return repairs===1?invalid:{keywords:'模型选择的新类别'};}
   if(prompt.startsWith('Choose up to 6'))return {urls:JSON.parse(messages[1].content).links.map(l=>l.url)};
   return base(messages);
 };
 const result=await runGeneralResearch(fixture.question,fixture.io);
 assert.equal(catalogs,2);assert.equal(result.agent.recovery.calls.rewrite,3);assert.equal(result.agent.recovery.calls.catalog,1);assert.equal(result.agent.recovery.calls.search,0);
 assert.ok(result.agent.recovery.after.comparable>=3);
});

test('a second catalog decision uses the first supplemental observations and shares the original discovery cap',async()=>{
 const fixture=recoveryFixture({domain:'computer',mode:'queries',initial:0}),base=fixture.io.model,requests=[];
 fixture.records.forEach((r,i)=>{r.url='https://m.suning.com/product/0000000000/'+(123456780+i)+'.html';});
 fixture.io.publicCatalogs=[{platform:'suning',input:'keywords'}];
 fixture.io.searchCatalog=async request=>{requests.push(request.keywords);const index=request.keywords==='最初类别'?0:request.keywords==='第一次补查'?1:2;const r=fixture.records[index];return {url:'https://search.suning.com/'+encodeURIComponent(request.keywords)+'/',text:'构造目录',observedLinks:[{url:r.url,title:r.name}]};};
 fixture.io.model=async messages=>{
  const p=messages[0].content;
  if(p.startsWith('Analyze this individual'))return {...await base(messages),catalogRequests:[{platform:'suning',keywords:'最初类别'}]};
  if(p.startsWith('The first sources'))return {queries:[],catalogRequests:[{platform:'suning',keywords:'第一次补查'}]};
  if(p.startsWith('Choose ONE alternative')){assert.equal(JSON.parse(messages[1].content).knownChoices.length,2);return {keywords:'根据新结果选择的类别'};}
  if(p.startsWith('Choose up to 6'))return {urls:JSON.parse(messages[1].content).links.map(l=>l.url)};
  return base(messages);
 };
 const result=await runGeneralResearch(fixture.question,fixture.io);
 assert.deepEqual(requests,['最初类别','第一次补查','根据新结果选择的类别']);assert.equal(result.agent.recovery.calls.catalog,2);assert.equal(result.agent.recovery.calls.search,0);assert.equal(result.agent.recovery.calls.rewrite,2);assert.equal(result.agent.recovery.after.comparable,3);
});

for(const spec of recoveryCases)test('bounded adaptive recovery: '+spec.id,async()=>{
  const fixture=recoveryFixture(spec),result=await runGeneralResearch(fixture.question,fixture.io);
  const eligible=evaluateDecision(result.candidates,result.settings,result.schema).filter(row=>row.status==='eligible');
  if(spec.control==='reject')assert.equal(eligible.length,0,'Unsupported or unreadable records must not become a success');
  else assert.ok(eligible.length>=3,'Recovery should achieve the comparison target using the supplied observations');
  assert.equal(fixture.counters.invalidReads,0,'A model-invented URL must never be read');
  assert.equal(new Set(fixture.reads).size,fixture.reads.length,'Already acquired pages should not be reread');
  const recovery=result.agent.recovery;
  assert.equal(recovery.after.comparable,eligible.length);
  if(result.analysis)assert.match(result.analysis.summary,new RegExp('有 '+eligible.length+' 个选择可以比较'));
  assert.ok(recovery.calls.rewrite<=4);
  assert.ok(recovery.calls.search<=2);assert.ok(recovery.calls.read<=14);assert.ok(recovery.calls.extract<=3);assert.ok(recovery.calls.selection<=4);
  if(spec.control==='sufficient')assert.equal(recovery.stopReason,'not-needed');
  if(spec.failSelection||spec.invalidSelection)assert.equal(recovery.calls.selection,2);
  if(spec.duplicateQueries)assert.equal(recovery.calls.search,1);
  for(const candidate of result.candidates){
    const expected=fixture.records.find(record=>record.name===candidate.name);assert.ok(expected);
    if(!spec.invalidFacts)for(const [i,field] of fixture.fields.entries())assert.equal(candidate.facts[field.key].value,expected.values[i]);
  }
});

test('observed detail discovery reuses same-host text links without trusting cross-host or authentication URLs',()=>{
  const source={url:'https://example.org/catalog',title:'Catalog',text:'https://example.org/detail/1 https://example.org/detail/1 https://elsewhere.example.org/1 https://example.org/login https://example.org/detail/2'};
  assert.deepEqual(observedResearchLinks([source],{exclude:['https://example.org/detail/2']}).map(link=>link.url),['https://example.org/detail/1']);
});

test('observed relative Markdown targets resolve within their actual origin, preserving the title and excluding image/auth links',()=>{
  const source={url:'https://example.org/catalog/index',text:'[真实条目](../detail/42) ![图片](/image.jpg) [跳过](//elsewhere.example.org/1) [登录](/login) [页内](#anchor)'};
  assert.deepEqual(observedResearchLinks([source]),[{url:'https://example.org/detail/42',title:'真实条目'}]);
});

test('invalid selections across multiple catalogs share one global four-call budget and never read invented targets',async()=>{
  let models=0,searches=0,reads=0;
  const result=await recoverResearch({question:'预算明确的租房选择',sources:[{id:'a',url:'https://zu.fang.com/hz/',text:'',observedLinks:[{url:'https://zu.fang.com/hz/chuzu/3_123456789_1.htm'}]}],raw:[],trace:[],contract:{settings:{},schema:{fields:[]},queries:[]}},
    {async model(messages){models++;return messages[0].content.startsWith('The first sources')?{queries:['q1','q2']}:{urls:['https://unobserved.example.org/invented']};},
      async search(query){searches++;return [{url:'https://zu.fang.com/hz/house/'+query+'/',title:'目录'}];},
      async fetchSource(url){reads++;assert(url.includes('/house/'),'Only observed catalogs may be read');return {url,text:'公开目录',observedLinks:[{url:'https://zu.fang.com/hz/chuzu/3_123456780_1.htm'}]};}},
    {event:(node,message)=>({node,message}),assess:()=>({comparable:0})});
  assert.equal(result.recovery.calls.selection,4);assert.equal(searches,2);assert.equal(reads,2);assert.equal(models,5);
  assert.equal(result.recovery.stopReason,'budget-exhausted');
});
test('constraint-caused exclusions guide a new catalog action and share the two-discovery budget with web searches',async()=>{
 const catalogs=[],urls=[],gaps=[];const fields=[{key:'price',label:'价格',unit:'元',direction:-1},{key:'mass',label:'重量',unit:'kg',direction:-1}];
 const initial='https://search.suning.com/first/',revised='https://search.suning.com/revised/';
 const old=[1,2,3].map(n=>'https://m.suning.com/product/000/'+(123450+n)+'.html'),fresh=[1,2,3].map(n=>'https://m.suning.com/product/000/'+(123460+n)+'.html');
 const result=await runGeneralResearch('测试设备价格不超过5000元，重量不超过2kg，需要来源图片',{
   publicCatalogs:[{platform:'suning',capabilities:['price-range']}],
   async searchCatalog(r){catalogs.push(r);return {url:catalogs.length===1?initial:revised,title:'构造测试目录',text:'构造测试目录',observedLinks:(catalogs.length===1?old:fresh).map(url=>({url,title:'测试设备'}))};},
   async search(){assert.fail('revised catalog is sufficient');},
   async model(messages){const p=messages[0].content,input=JSON.parse(messages[1].content);
     if(p.startsWith('Analyze this individual'))return {schema:{fields},constraints:[{field:'price',value:5000,quote:'价格不超过5000元'},{field:'mass',value:2,quote:'重量不超过2kg'}],queries:[],catalogRequests:[{platform:'suning',keywords:'测试设备'}],whatifs:[{name:'更宽预算',changes:[{field:'price',value:6000}]}]};
     if(p.startsWith('Select up to 6'))return {urls:old};
     if(p.startsWith('The first sources')){gaps.push(input.gaps);return {queries:['unnecessary'],catalogRequests:[{platform:'suning',keywords:'便携测试设备'}]};}
     if(p.startsWith('Choose up to 6 concrete'))return {urls:fresh};
     if(p.startsWith('Analyze ONLY'))return {summary:'',insights:[]};throw new Error('Unexpected model call');
   },
   async fetchSource(url){urls.push(url);assert.notEqual(url,initial,'already-read catalog must not be refetched');const price=old.includes(url)?9000:4000,mass=old.includes(url)?3:1.5;
     const o=parseMerchantDetail({url,title:'测试设备',productTitle:'测试设备'+url.split('/').pop(),text:'¥'+price,priceText:'¥'+price,images:['https://imgservice.suning.cn/fixture.jpg']},{url,cells:['净重：'+mass+'千克']});return {text:o.text,merchantObservation:o};
   }
 });
 assert.equal(catalogs.length,2);assert.equal(catalogs[1].priceRange.maximum,5000);assert.equal(urls.length,6);
 assert.ok(gaps[0].excludedReasons.some(r=>r.includes('价格')));assert.ok(gaps[0].excludedReasons.some(r=>r.includes('重量')));
 assert.equal(result.agent.recovery.after.comparable,3);assert.equal(result.agent.recovery.calls.catalog,1);assert.equal(result.agent.recovery.calls.search,0);
});
