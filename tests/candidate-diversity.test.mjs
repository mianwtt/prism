import test from 'node:test';
import assert from 'node:assert/strict';
import {observedConfigurationKey,selectDiverseCandidates} from '../src/candidate-diversity.mjs';
import {runGeneralResearch} from '../src/general-research.mjs';
import {parseMerchantDetail} from '../src/public-merchant-read.mjs';
import {assessResearchTask} from '../scripts/lib/research-acceptance.mjs';
const schema={label:'构造测试',optionLabel:'机器',fields:[{key:'price',label:'价格',unit:'元',direction:-1},{key:'ram',label:'内存',unit:'GB',direction:1}],layout:{primaryField:'price'}};
const settings={limits:{price:7000,ram:16},weights:{price:1,ram:1},evidenceMode:'cited'};
function fixture(){
  const sources=Array.from({length:4},(_,i)=>{
    const url='https://m.suning.com/product/0000000000/'+(123456780+i)+'.html',name='虚构机器 '+(i<2?'A':i===2?'B':'C')+(i===1?' 银色':''),cells=['品牌：虚构品牌','型号：测试型号'+(i<2?'AAA':i===2?'BBB':'CCC'),'内存容量：16GB','净重：1kg','处理器：虚构芯片','颜色：'+(i===1?'银色':'黑色')];
    const o=parseMerchantDetail({url,title:name,productTitle:name,priceText:'¥'+(i===1?4500:5000),text:name,images:['https://imgservice.suning.cn/test-'+i+'.jpg']},{url,cells});
    return {id:'source-'+i,url,title:name,text:o.text,merchantObservation:o};
  });
  const candidates=sources.map((s,i)=>({id:'c'+i,name:s.merchantObservation.name,sourceId:s.id,facts:{price:{value:i===1?4500:5000,status:'cited',sourceId:s.id,quote:'¥'+(i===1?4500:5000)},ram:{value:16,status:'cited',sourceId:s.id,quote:'内存容量：16GB'}}}));
  return {sources,candidates};
}
test('same observed configuration groups colour/seller offers, keeps the best eligible offer and retains all source records',()=>{
  const {sources,candidates}=fixture(),before=structuredClone({sources,candidates});
  const result=selectDiverseCandidates(candidates,sources,schema,settings);
  assert.equal(result.candidates.length,3);assert.equal(result.duplicates.length,1);assert.equal(result.duplicates[0].representativeId,'c1');
  assert.deepEqual({sources,candidates},before);assert.equal(observedConfigurationKey(candidates[0],sources,schema),observedConfigurationKey(candidates[1],sources,schema));
});
test('configuration grouping never relies on a name, matching numeric scores, housing project, or unquoted attributes alone',()=>{
  const {sources,candidates}=fixture();delete sources[1].merchantObservation;
  assert.equal(selectDiverseCandidates(candidates,sources,schema,settings).candidates.length,4);
  const second=fixture();second.sources[1].text='没有参数的页面';assert.equal(observedConfigurationKey(second.candidates[1],second.sources,schema),null);
  const third=fixture();third.sources[1].merchantObservation.attributes=third.sources[1].merchantObservation.attributes.filter(a=>!['处理器','净重'].includes(a.label));assert.equal(observedConfigurationKey(third.candidates[1],third.sources,schema),null);
});
test('different specification values and explicit appearance preferences remain separate; manual decisions are not regrouped',()=>{
  const {sources,candidates}=fixture();candidates[1].facts.ram.value=32;
  assert.equal(selectDiverseCandidates(candidates,sources,schema,settings).candidates.length,4);
  const s=fixture();for(const question of ['只要白色的机器','更关注颜色'])assert.equal(selectDiverseCandidates(s.candidates,s.sources,schema,settings,{question}).candidates.length,4);
  const colours={...schema,fields:[...schema.fields,{key:'colour',label:'外观颜色',type:'enum',options:['银色','黑色']}]};
  assert.equal(observedConfigurationKey(s.candidates[0],s.sources,colours),null);
  s.candidates[1].facts.price.status='confirmed';assert.equal(selectDiverseCandidates(s.candidates,s.sources,schema,settings).candidates.length,4);
});
test('a request to ignore colour differences enables grouping without erasing a separate real colour preference',()=>{
 const {sources,candidates}=fixture();
 for(const question of ['仅配色不同不算新的配置','颜色不同不计为不同配置','忽略配色','不考虑颜色'])assert.equal(selectDiverseCandidates(candidates,sources,schema,settings,{question}).candidates.length,3);
 assert.equal(selectDiverseCandidates(candidates,sources,schema,settings,{question:'仅配色不同不算，但我只要白色的机器'}).candidates.length,4);
});
test('the independent task gate recomputes supported configuration groups instead of trusting application counts',()=>{
 const {sources,candidates}=fixture();for(const c of candidates)c.media={url:'https://imgservice.suning.cn/test.jpg',sourceId:c.sourceId,sourceUrl:sources.find(s=>s.id===c.sourceId).url};
 const task={question:'比较机器',distinctConfigurations:true,criteria:[{kind:'price',unit:'元',maximum:7000},{kind:'memory',unit:'GB',minimum:16}],sourceImages:true};
 const result=assessResearchTask(task,{sources,candidates,schema,settings});assert.equal(result.qualified,3);assert.equal(result.rows.filter(r=>r.configurationDuplicate).length,1);
 delete sources[2].merchantObservation;assert.equal(assessResearchTask(task,{sources,candidates,schema,settings}).qualified,2);
});
test('a compiled research graph does not stop at three colour variants and recovers a third actual configuration',async()=>{
  const {sources}=fixture(),catalog='https://search.suning.com/test/',reads=[],first=[sources[0],sources[1],sources[2]];let continuing=false;
  const io={
    publicCatalogs:[{platform:'suning',capabilities:['configuration-attributes']}],
    async searchCatalog(){return {url:catalog,title:'虚构目录',text:'虚构目录',observedLinks:sources.map(s=>({url:s.url,title:s.title}))};},
    async model(messages){const prompt=messages[0].content;
      if(prompt.startsWith('Analyze this individual'))return {schema,constraints:[{field:'price',value:7000,quote:'价格不超过7000元'},{field:'ram',value:16,quote:'内存至少16GB'}],queries:['测试'],catalogRequests:[{platform:'suning',keywords:'测试'}],whatifs:[{name:'更低预算',changes:[{field:'price',value:6000}]}]};
      if(prompt.startsWith('Select up to 6'))return {urls:(continuing?sources:first).map(s=>s.url)};
      if(prompt.includes('There are fewer')){assert.equal(JSON.parse(messages[1].content).gaps.comparable,2);return {urls:[sources[3].url]};}
      if(prompt.startsWith('Analyze ONLY'))return {summary:'构造测试',insights:[]};
      assert.fail('Unexpected model call: '+prompt.slice(0,70));
    },
    async search(){assert.fail('Observed details should suffice');},
    async fetchSource(url){reads.push(url);const s=sources.find(s=>s.url===url);assert(s);return {url,text:s.text,title:s.title,merchantObservation:s.merchantObservation};}
  };
  const result=await runGeneralResearch('比较机器，价格不超过7000元，内存至少16GB，需要至少3种不同硬件配置和原图',io);
  assert.equal(result.agent.recovery.before.comparable,2);assert.equal(result.agent.recovery.after.comparable,3);
  assert.equal(result.evidenceRequirements.distinctConfigurations,true);
  assert.equal(result.candidates.length,3);assert(result.drafts.some(d=>d.reason.includes('相同已观察配置')));assert.equal(result.sources.filter(s=>s.merchantObservation).length,4);assert(reads.includes(sources[3].url));
  assert.equal(result.candidates.find(c=>c.name.includes('A')).facts.price.value,4500);
  continuing=true;const before=structuredClone(result),scenario=result.scenarios.find(s=>s.id!=='scenario-baseline');
  const followup=await runGeneralResearch(result.question,io,()=>{},{previous:result,scenario,scenarios:result.scenarios});
  assert.deepEqual(result,before);assert.deepEqual(followup.baselineCandidateIds,result.baselineCandidateIds);assert.deepEqual(followup.scenarios[0],result.scenarios[0]);
  assert.equal(followup.scenarios.find(s=>s.id===scenario.id).candidateIds.length,3);
});
