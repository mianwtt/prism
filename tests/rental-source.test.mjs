import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRentalPage,parseRentalCatalog,rentalDetailUrl,rentalCatalogUrl,rentalRedirectUrl,decodeRentalHtml,attachRentalPage,rentalRawCandidate,bindRentalImages} from '../src/public-rental-read.mjs';
import {checkDecisionCandidates,runGeneralResearch,planDecision,normalizeResearchPlan} from '../src/general-research.mjs';
import {validateDecisionSchema} from '../src/decision-schema.mjs';
import {refreshGeneralEvidence} from '../src/general-refresh.mjs';
import {rentalHtml,rentalUrl,rentalPlan} from './fixtures/rental-page.mjs';

test('a rental detail observation uses the main listing price and indoor photo tags, ignoring logos, floorplans and neighboring offers',()=>{
 const o=parseRentalPage(rentalHtml,rentalUrl);
 assert.equal(o.price,3200);assert.equal(o.area,40);assert.equal(o.metro,350);assert.equal(o.name,'软件测试公寓');assert.equal(o.rentalType,'整租');
 assert.deepEqual(o.images,['https://cdnsfb.soufunimg.com/fixture-room-a.jpg','https://cdnsfb.soufunimg.com/fixture-room-b.jpg']);
 assert.equal(rentalDetailUrl('https://zu.fang.com/user/login'),null);assert.equal(rentalDetailUrl('https://zu.fang.com.evil.org/hz/chuzu/3_123_1.htm'),null);assert.equal(rentalDetailUrl('http://zu.fang.com/hz/chuzu/3_123_1.htm'),null);
 assert.equal(parseRentalPage('<title>登录</title>',rentalUrl),null);
 assert.equal(parseRentalPage(rentalHtml.replace('<i>3200</i>元/月','<i>3200</i>元/月 起'),rentalUrl),null);
});
test('source-bound images and facts follow actual field semantics and never fill commute time or a different listing',()=>{
 const schema=validateDecisionSchema({...rentalPlan.schema,fields:[...rentalPlan.schema.fields,{key:'journey',label:'实际通勤',unit:'分钟',direction:-1}]}),o=parseRentalPage(rentalHtml,rentalUrl);
 const source={id:'s1',url:rentalUrl,title:o.title,text:o.text,kind:'page'};attachRentalPage(source,{pageIdentity:{name:o.name},rentalObservation:o});
 const raw=rentalRawCandidate(source,schema);assert.equal(raw.facts.rentAmount.value,3200);assert.equal(raw.facts.journey,undefined);
 const checked=checkDecisionCandidates([raw],[source],schema);bindRentalImages(checked.candidates,[source]);
 assert.equal(checked.candidates[0].facts.rentAmount.status,'cited');assert.equal(checked.candidates[0].facts.journey.value,null);
 assert.equal(checked.candidates[0].media.sourceUrl,rentalUrl);assert.equal(checked.candidates[0].media.kind,'listing-photo');
 const other={...checked.candidates[0],sourceId:'s2'};delete other.media;bindRentalImages([other],[source]);assert.equal(other.media,undefined);
 const unavailable=parseRentalPage(rentalHtml.replace(/<img imagetype="室内图"[^>]*>/g,''),rentalUrl);assert.deepEqual(unavailable.images,[]);
});
test('the actual LangGraph accepts typed public rental observations without asking a model to invent values or replacing photos with metadata art',async()=>{
 const o=parseRentalPage(rentalHtml,rentalUrl);let enrichCalls=0,extractionCalls=0;
 const space=await runGeneralResearch('月租不超过4000元/月，面积至少30㎡，另比较地铁站距离',{
  async model(messages){const prompt=messages[0].content;if(prompt.startsWith('Analyze this individual'))return rentalPlan;if(prompt.startsWith('Analyze ONLY'))return {summary:'',insights:[]};if(prompt.startsWith('The first sources'))return {queries:[]};extractionCalls++;throw new Error('No generative fact extraction is needed for this structured page');},
  async search(){return [{url:rentalUrl,title:o.title,raw_content:o.text}];},
  async fetchSource(){return {text:o.text,title:o.title,pageIdentity:{name:o.name},rentalObservation:o};},
  async enrichImages(){enrichCalls++;return [{sourceUrl:rentalUrl,url:'https://static.soufunimg.com/logo.png'}];}
 });
 assert.equal(space.agent.framework,'LangGraph');assert.equal(space.mode,'live');assert.equal(space.candidates.length,1);assert.equal(space.candidates[0].media.url,o.images[0]);assert.equal(space.candidates[0].facts.rentAmount.value,3200);
 assert.equal(space.candidates[0].facts.stationWalk.value,350);assert.equal(extractionCalls,0);assert.equal(enrichCalls,0);
});
test('a missing numeric unit embedded only in a model label is repaired before source extraction',async()=>{
 let calls=0;
 const broken=structuredClone(rentalPlan);broken.schema.fields[0].label='月租 (元/月)';delete broken.schema.fields[0].unit;
 const plan=await planDecision('月租不超过4000元/月，面积至少30㎡',{async model(){return ++calls===1?broken:rentalPlan;}});
 assert.equal(calls,2);assert.equal(plan.schema.fields[0].unit,'元/月');
});
test('explicit smaller-is-better directions are repaired even when the same field appeared earlier in the request',async()=>{
 let calls=0;const broken=structuredClone(rentalPlan);broken.schema.fields[2].direction=1;
 const plan=await planDecision('月租不超过4000元/月，面积至少30㎡。另比较地铁站距离，地铁站距离越小越好。',{async model(){return ++calls===1?broken:rentalPlan;}});
 assert.equal(calls,2);assert.equal(plan.schema.fields[2].direction,-1);
});
test('source refresh replaces or withdraws listing photos rather than keeping them attached to a newly checked page',async()=>{
 const schema=validateDecisionSchema(rentalPlan.schema),o=parseRentalPage(rentalHtml,rentalUrl),source={id:'s1',url:rentalUrl,title:o.title,text:o.text,kind:'page',retrievedAt:'2026-11-01T00:00:00.000Z'};
 attachRentalPage(source,{pageIdentity:{name:o.name},rentalObservation:o});
 const {candidates}=checkDecisionCandidates([rentalRawCandidate(source,schema)],[source],schema);bindRentalImages(candidates,[source]);
 const space={schema,candidates,sources:[source],trace:[]},old=structuredClone(space),next=parseRentalPage(rentalHtml.replaceAll('fixture-room-a','new-room-a'),rentalUrl);
 const updated=await refreshGeneralEvidence(space,{fetchSource:async()=>({text:next.text,pageIdentity:{name:next.name},rentalObservation:next})});
 assert.match(updated.candidates[0].media.url,/new-room-a/);assert.equal(updated.refreshReport.imagesUpdated,1);assert.deepEqual(space,old);
 const failed=await refreshGeneralEvidence(space,{fetchSource:async()=>{throw new Error('unreadable');}});assert.equal(failed.candidates[0].media,undefined);assert.equal(failed.refreshReport.imagesWithdrawn,1);assert.equal(failed.candidates[0].facts.rentAmount.status,'unknown');
 const textOnly=await refreshGeneralEvidence(space,{fetchSource:async()=>o.text});assert.equal(textOnly.candidates[0].media,undefined);assert.equal(textOnly.candidates[0].facts.rentAmount.status,'cited');
});
test('a detail page cannot borrow another listing identity or indoor images from recommended cards',()=>{
 const extended=rentalHtml.replace('</body>','<div class="recommended"><img imagetype="室内图" src="https://cdnsfb.soufunimg.com/other-listing.jpg"></div></body>');
 assert.equal(parseRentalPage(extended,rentalUrl).images.length,2);
 const mismatch=extended.replace('</head>','<script type="application/ld+json">{"@type":"Product","url":"https://zu.fang.com/hz/chuzu/3_999_1.htm","offers":{"price":3200}}</script></head>');
 assert.equal(parseRentalPage(mismatch,rentalUrl),null);
 const conflicting=extended.replace('</head>','<script type="application/ld+json">{"@type":"Product","offers":{"price":9999}}</script></head>');assert.equal(parseRentalPage(conflicting,rentalUrl),null);
});
test('image provenance instructions cannot become an extra eligibility dimension',async()=>{
 for(const label of ['有原页图片','有室内图','有原图','是否提供照片','来源图片','原图已验证','原图已读取','图片已获取']){let calls=0;const broken=structuredClone(rentalPlan);broken.schema.fields.push({key:'photoPresent',label,type:'boolean',direction:1});
  const result=await planDecision('月租不超过4000元/月，面积至少30㎡，另比较地铁站距离。价格和原页图片需要对应。',{async model(){return ++calls===1?broken:rentalPlan;}});
  assert.equal(calls,1);assert.equal(result.schema.fields.some(f=>f.key==='photoPresent'),false);assert.equal(result.evidenceRequirements.sourcePhotos,true);
 }
});
test('an explicitly requested rental-type enum is extracted from the same detail page',()=>{
 const schema=validateDecisionSchema({fields:[{key:'wayToRent',label:'租赁方式',type:'enum',options:['整租','合租'],direction:1}]}),o=parseRentalPage(rentalHtml,rentalUrl),source={id:'s1',url:rentalUrl,title:o.title,text:o.text,kind:'page'};attachRentalPage(source,{pageIdentity:{name:o.name},rentalObservation:o});
 const {candidates}=checkDecisionCandidates([rentalRawCandidate(source,schema)],[source],schema);assert.equal(candidates[0].facts.wayToRent.value,'整租');assert.equal(candidates[0].facts.wayToRent.status,'cited');
 const booleanSchema=validateDecisionSchema({fields:[{key:'whole',label:'是否整租',type:'boolean',direction:1}]});
 const bool=checkDecisionCandidates([rentalRawCandidate(source,booleanSchema)],[source],booleanSchema).candidates[0];assert.equal(bool.facts.whole.status,'cited');assert.equal(bool.facts.whole.value,true);
 const labelSchema=validateDecisionSchema({fields:[{key:'type',label:'房源类型',type:'enum',options:['整租','合租'],direction:1}]});
 assert.equal(checkDecisionCandidates([rentalRawCandidate(source,labelSchema)],[source],labelSchema).candidates[0].facts.type.value,'整租');
});

test('equivalent square-metre spellings never turn real quoted areas into missing facts',()=>{
 const o=parseRentalPage(rentalHtml,rentalUrl),source={id:'area',url:rentalUrl,title:o.title,text:o.text,kind:'page'};attachRentalPage(source,{pageIdentity:{name:o.name},rentalObservation:o});
 for(const unit of ['㎡','平方米','平米','m²','m2','sqm','sq m','sq.m','sq.m.','m^2','square meters','square metres']){
  const schema=validateDecisionSchema({fields:[{key:'area',label:'建筑面积',unit,direction:1}]});const c=checkDecisionCandidates([rentalRawCandidate(source,schema)],[source],schema).candidates[0];assert.equal(c.facts.area.status,'cited',unit);assert.equal(c.facts.area.value,40);
 }
 const unsupported=validateDecisionSchema({fields:[{key:'area',label:'建筑面积',unit:'sqft',direction:1}]});assert.equal(rentalRawCandidate(source,unsupported).facts.area,undefined);
});

test('a nested model plan preserves quoted constraints while separating image requirements without another model turn',async()=>{
 const raw=structuredClone(rentalPlan),original=structuredClone(raw);
 raw.schema.fields.push({key:'hasPhoto',label:'有室内图',type:'boolean',direction:1});
 raw.schema.constraints=[...raw.constraints,{field:'hasPhoto',value:true,quote:'有室内图'}];raw.schema.queries=raw.queries;raw.schema.whatifs=raw.whatifs;
 delete raw.constraints;delete raw.queries;delete raw.whatifs;let calls=0;
 const snapshot=structuredClone(raw),plan=await planDecision('月租不超过4000元/月，面积至少30㎡，另比较地铁站距离，需要有室内图',{model:async()=>{calls++;return raw;}});
 assert.equal(calls,1);assert.equal(plan.settings.limits.rentAmount,4000);assert.equal(plan.settings.limits.floorSpace,30);
 assert.deepEqual(plan.schema.fields.map(f=>f.key),original.schema.fields.map(f=>f.key));assert.equal(plan.evidenceRequirements.sourcePhotos,true);assert.deepEqual(raw,snapshot);
 assert.deepEqual(normalizeResearchPlan({schema:{fields:[{key:'balcony',label:'有阳台',type:'boolean'}]}}).schema.fields.map(f=>f.key),['balcony']);
});

test('unsolicited photo fields never add an image prerequisite to a text-only request',async()=>{
 const raw=structuredClone(rentalPlan);raw.schema.fields.push({key:'photo',label:'有原页图片',type:'boolean'});
 const plan=await planDecision('月租不超过4000元/月，面积至少30㎡，另比较地铁站距离',{model:async()=>raw});
 assert.equal(plan.evidenceRequirements.sourcePhotos,false);assert(!plan.schema.fields.some(f=>f.key==='photo'));
});

test('follow-up condition edits preserve the original photo requirement unless the user explicitly withdraws it',async()=>{
 const original=await planDecision('月租不超过4000元/月，面积至少30㎡，另比较地铁站距离，需要原图',{model:async()=>rentalPlan}),previous={schema:original.schema},scenario={settings:original.settings};
 for(const [adaptation,expected]of [['月租减少500',true],['无需图片，月租减少500',false]]){
  const plan=await planDecision('月租不超过4000元/月，面积至少30㎡，另比较地铁站距离，需要原图',{model:async()=>rentalPlan},{previous,scenario,adaptation});assert.equal(plan.evidenceRequirements.sourcePhotos,expected);assert.equal(plan.settings.limits.rentAmount,3500);
 }
});

test('observed city aliases may redirect within the public platform, but never to a login, private host or different listing',()=>{
 const original='https://zu.fang.com/cd/chuzu/3_123456789_1.htm',canonical='https://zu.fang.com/chengdu/chuzu/3_123456789_1.htm';
 assert.equal(rentalRedirectUrl(original,canonical),canonical);assert.equal(rentalRedirectUrl('https://zu.fang.com/cd/','/chengdu/'),'https://zu.fang.com/chengdu/');
 for(const target of ['http://zu.fang.com/chengdu/chuzu/3_123456789_1.htm','https://127.0.0.1/private','https://zu.fang.com/login','https://zu.fang.com/chengdu/chuzu/3_987654321_1.htm','https://evil.org/'])assert.equal(rentalRedirectUrl(original,target),null);
 const o=parseRentalPage(rentalHtml,canonical),source={id:'alias',url:original,title:'城市别名',text:o.text,kind:'page'};
 attachRentalPage(source,{requestedUrl:original,url:canonical,text:o.text,pageIdentity:{name:o.name},rentalObservation:o});assert.equal(source.url,canonical);assert.equal(source.retrieval.redirectedFrom,original);assert.equal(source.rentalObservation.url,canonical);
 const other={id:'other',url:original};attachRentalPage(other,{requestedUrl:original,url:canonical.replace('123456789','987654321'),pageIdentity:{name:o.name},rentalObservation:o});assert.equal(other.url,original);assert.equal(other.rentalObservation,undefined);
});

const mobileUrl='https://m.fang.com/zf/cd/3_123456789.html';
const mobileHtml=`<title>软件测试公寓租房_公开页面</title><script>pageConfig.houseid='123456789';pageConfig.projname='软件测试公寓';pageConfig.area='56.54';pageConfig.price='1800';</script>
<div class="zf-price"><div class="price"><div class="num">1800</div><div>元/月</div></div></div>
<ul class="hxStyle-left"><li><div class="txt"><div>1室1厅</div><p>整租</p></div></li><li><div class="txt"><div>56.54㎡</div><p>面积</p></div></li></ul>
<div class="xqfocusbox"><div><ul><li data-name="图片"><img src="//cdnsfb.soufunimg.com/test-original.jpg"></li><li data-name="视频"><img src="https://cdnsfb.soufunimg.com/video.jpg"></li><li data-name="户型"><img src="https://cdnsfb.soufunimg.com/floorplan.jpg"></li></ul></div></div>
<div class="recommended"><li data-name="图片"><img src="https://cdnsfb.soufunimg.com/other.jpg"></li>900元/月</div>`;

test('public mobile details retain decimal areas, verify identity and take only the current gallery photographs',()=>{
 const o=parseRentalPage(mobileHtml,mobileUrl);assert.equal(o.price,1800);assert.equal(o.area,56.54);assert.equal(o.rentalType,'整租');assert.deepEqual(o.images,['https://cdnsfb.soufunimg.com/test-original.jpg']);
 const schema=validateDecisionSchema({fields:[{key:'type',label:'租房类型',type:'enum',options:['整租','合租']}]}),source={id:'mobile',url:mobileUrl,title:o.title,text:o.text,kind:'page'};attachRentalPage(source,{text:o.text,pageIdentity:{name:o.name},rentalObservation:o});
 assert.equal(checkDecisionCandidates([rentalRawCandidate(source,schema)],[source],schema).candidates[0].facts.type.status,'cited');
 assert.equal(parseRentalPage(mobileHtml.replace("houseid='123456789'","houseid='987654321'"),mobileUrl),null);
 assert.equal(parseRentalPage(mobileHtml.replace("area='56.54'","area='90'"),mobileUrl),null);assert.equal(parseRentalPage(mobileHtml.replace('<div>元/月</div>','<div>元/月 起</div>'),mobileUrl),null);
 assert.equal(rentalRedirectUrl(mobileUrl,mobileUrl.replace('123456789','987654321')),null);
});

test('legacy Chinese encodings and mobile catalogs retain readable observed listing summaries',()=>{
 assert.equal(decodeRentalHtml(Buffer.from('d7e2b7bf','hex'),'text/html; charset=gb2312'),'租房');
 const declared=Buffer.concat([Buffer.from('<meta charset="gbk">'),Buffer.from('d7e2b7bf','hex')]);assert.equal(decodeRentalHtml(declared),'<meta charset="gbk">租房');assert.equal(decodeRentalHtml(Buffer.from('原图')),'原图');
 const page=parseRentalCatalog(`<title>成都租房</title><ul><li><a href="${mobileUrl}">软件测试公寓</a>整租 56.54㎡ 1800元/月</li><li><a href="https://evil.org/1.html">错误目标</a></li></ul>`,'https://m.fang.com/zf/cd/');
 assert.equal(page.observedLinks.length,1);assert.equal(page.observedLinks[0].url,mobileUrl);assert(page.observedLinks[0].summary.includes('56.54㎡'));
});

test('an explicit source-photo requirement leaves text-only records as traceable drafts instead of complete comparison cards',async()=>{
 const o=parseRentalPage(mobileHtml.replace('data-name="图片"','data-name="视频"'),mobileUrl);
 const space=await runGeneralResearch('月租不超过4000元/月，面积至少30㎡，需要原页图片',{
  async model(messages){if(messages[0].content.startsWith('Analyze this individual'))return {...rentalPlan,schema:{...rentalPlan.schema,fields:rentalPlan.schema.fields.slice(0,2)}};return {queries:[]};},
  async search(){return [{url:mobileUrl,title:o.title,raw_content:o.text}];},async fetchSource(){return {text:o.text,pageIdentity:{name:o.name},rentalObservation:o};}
 });
 assert.equal(space.candidates.length,0);assert.equal(space.drafts.length,1);assert.match(space.drafts[0].reason,/原页图片/);assert.equal(space.sources[0].text,o.text);
});
test('a zero-candidate graph makes one bounded recovery and follows only publicly observed listing URLs',async()=>{
 const catalogUrl='https://zu.fang.com/hz/house/n31/',html=`<title>软件测试租房列表</title><dl class="list"><a href="/hz/chuzu/3_123456789_1.htm">软件测试公寓</a>整租 40㎡ 3200元/月</dl>`;
 const catalog=parseRentalCatalog(html,catalogUrl),o=parseRentalPage(rentalHtml,rentalUrl);let searches=0;
 const result=await runGeneralResearch('月租不超过4000元/月，面积至少30㎡，另比较地铁站距离',{
  async model(messages){const p=messages[0].content;if(p.startsWith('Analyze this individual'))return rentalPlan;if(p.startsWith('The first sources'))return {queries:['另一组公开租房查询','不超过两次的查询']};if(p.startsWith('Choose up to 4'))return {urls:[rentalUrl,'https://example.org/invented']};if(p.startsWith('Analyze ONLY'))return {summary:'',insights:[]};return {candidates:[]};},
  async search(){return ++searches===1?[{url:'https://example.org/generic',title:'泛泛介绍',raw_content:'没有具体房源'}]:[{url:catalogUrl,title:catalog.title,raw_content:catalog.text}];},
  async fetchSource(url){if(url===catalogUrl)return catalog;if(url===rentalUrl)return {text:o.text,title:o.title,pageIdentity:{name:o.name},rentalObservation:o};if(url==='https://example.org/generic')return '没有具体房源';throw new Error('An unobserved URL was requested');}
 });
 assert.equal(searches,3);assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].facts.rentAmount.value,3200);assert.ok(result.trace.some(e=>e.node==='recover'));assert.equal(result.candidates[0].media.sourceUrl,rentalUrl);
});

test('incomplete candidates do not suppress recovery; the graph fills its pool from remaining observed details only',async()=>{
 const catalogUrl='https://zu.fang.com/hz/',observations=Array.from({length:4},(_,i)=>parseRentalPage(rentalHtml.replaceAll('软件测试公寓','软件测试公寓'+i),rentalUrl.replace('123456789',String(123456780+i))));
 const catalog=parseRentalCatalog('<title>测试目录</title>'+observations.map(o=>`<dl class="list"><a href="${o.url}">${o.name}</a>整租 40㎡ 3200元/月</dl>`).join(''),catalogUrl);let searches=0;const read=[];
 const space=await runGeneralResearch('月租不超过4000元/月，面积至少30㎡，另比较地铁站距离',{
  async search(){searches++;return [{url:catalogUrl,title:catalog.title,raw_content:catalog.text}];},
  async fetchSource(url){read.push(url);if(url===catalogUrl)return catalog;const o=observations.find(o=>o.url===url);assert(o,'Only observed URLs may be read');return o===observations[0]?o.text:{text:o.text,title:o.title,pageIdentity:{name:o.name},rentalObservation:o};},
  async model(messages){const p=messages[0].content;if(p.startsWith('Analyze this individual'))return rentalPlan;if(p.startsWith('Select up to 6'))return {urls:[observations[0].url]};if(p.startsWith('There are fewer'))return {urls:[...observations.slice(1).map(o=>o.url),'https://example.org/fabricated']};if(p.startsWith('Analyze ONLY'))return {summary:'',insights:[]};
   if(p.startsWith('Return compact JSON {candidates:')){const source=JSON.parse(messages[1].content).sources[0];return {candidates:[{name:observations[0].name,sourceId:source.id,facts:{rentAmount:{value:3200,quote:'3200元/月',sourceId:source.id}}}]};}
   throw new Error('Unnecessary model search after adequate catalog recovery');
  }
 });
 // One initial search plus the existing targeted missing-fact check; catalog recovery needs no further search.
 assert.equal(searches,2);assert.equal(read.length,5);assert.equal(space.candidates.length,4);assert.equal(space.candidates.filter(c=>c.media?.kind==='listing-photo').length,3);assert(space.trace.some(e=>e.node==='recover'));assert(!read.some(url=>url.includes('fabricated')));
});

test('observed mobile filters and topic catalogs reach the public reader without admitting arbitrary site paths',()=>{
 const filtered='https://m.fang.com/zf/hz/m0/?zttype=hpnm';
 assert.equal(rentalCatalogUrl(filtered),'https://m.fang.com/zf/hz/m0/');
 assert.equal(rentalCatalogUrl('https://m.fang.com/zf/hz/p0m0/'),'https://m.fang.com/zf/hz/p0m0/');
 const topic='https://www.fang.com/houses/zf_122429hz/',target='https://zu.fang.com/hz/houses/zf_122429hz/';
 assert.equal(rentalCatalogUrl(topic),topic);assert.equal(rentalCatalogUrl(target),target);
 assert.equal(rentalRedirectUrl(topic,target),target);
 const page=parseRentalCatalog(`<title>筛选目录</title><li><a href="${mobileUrl}">软件测试公寓</a>整租 56.54㎡ 1800元/月</li>`,filtered);
 assert.equal(page.observedLinks[0].url,mobileUrl);
 for(const url of ['https://m.fang.com/zf/hz/login/','https://www.fang.com/login','https://www.fang.com/houses/other/','https://m.fang.com/zf/hz/m0/private','http://m.fang.com/zf/hz/m0/','https://evil.org/zf/hz/m0/'])assert.equal(rentalCatalogUrl(url),null);
 assert.equal(rentalRedirectUrl(topic,'https://www.fang.com/login'),null);
 assert.equal(rentalRedirectUrl(topic,'https://evil.org/hz/houses/zf_122429hz/'),null);
});

test('a monthly rent label with currency-only units binds an explicit monthly quote but never an annual or unspecified amount',()=>{
 const schema=validateDecisionSchema({fields:[{key:'monthlyRent',label:'月租金',unit:'元',direction:-1}]}),o=parseRentalPage(rentalHtml,rentalUrl);
 const source={id:'monthly',url:rentalUrl,title:o.title,text:o.text,kind:'page'};attachRentalPage(source,{text:o.text,pageIdentity:{name:o.name},rentalObservation:o});
 const raw=rentalRawCandidate(source,schema),checked=checkDecisionCandidates([raw],[source],schema);
 assert.equal(checked.candidates[0].facts.monthlyRent.value,o.price);
 for(const quote of ['3200元/年','3200元/周','租金3200元']){
  const other={id:'other',url:'https://example.org/offer',title:'测试住处',text:'测试住处 '+quote};
  const result=checkDecisionCandidates([{name:'测试住处',sourceId:other.id,facts:{monthlyRent:{value:3200,quote,sourceId:other.id}}}],[other],schema);
  assert.equal(result.candidates.length,0,'An explicit monthly field needs monthly support');
 }
 const ambiguous=validateDecisionSchema({fields:[{key:'deposit',label:'押金',unit:'元',direction:-1}]});
 assert.deepEqual(rentalRawCandidate(source,ambiguous).facts,{},'Monthly rent must not fill a deposit or an unrelated currency field');
});
