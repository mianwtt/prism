import test from 'node:test';
import assert from 'node:assert/strict';
import {merchantCatalogUrl,parseMerchantDetail,attachMerchantPage,merchantRawCandidate,bindMerchantImages} from '../src/public-merchant-read.mjs';
import {checkDecisionCandidates,normalizeResearchPlan,runGeneralResearch,planDecision} from '../src/general-research.mjs';
import {refreshGeneralEvidence} from '../src/general-refresh.mjs';
const url='https://m.suning.com/product/0000000000/123456.html';
const snapshot={url,title:'测试配置甲 32GB/1TB',productTitle:'测试配置甲 32GB/1TB',priceText:'¥6499.00',text:'¥6499.00\n无货',images:['https://imgservice.suning.cn/product-a.jpg','https://unrelated.example/b.jpg']};
const spec={url:'https://www.suning.com/itemcanshu/0000000000/123456.html',cells:['内存容量：32GB','最大支持内存：64GB','硬盘容量：1TB','硬盘类型：固态硬盘','净重：1.5千克','包装重量：2.5千克']};
const schema={fields:[{key:'cost',label:'价格',type:'number',unit:'元'},{key:'ram',label:'内存',type:'number',unit:'GB'},{key:'ssd',label:'硬盘',type:'number',unit:'GB'},{key:'mass',label:'重量',type:'number',unit:'kg'}]};
function source(){const o=parseMerchantDetail(snapshot,spec),s={id:'a',url,text:o.text,kind:'page'};attachMerchantPage(s,{merchantObservation:o,observedAt:new Date().toISOString()});return s;}
test('public detail adapter maps only observed attributes to Agent dimensions, preserving units and price despite no stock',()=>{
  const s=source(),raw=merchantRawCandidate(s,schema),{candidates}=checkDecisionCandidates([raw],[s],schema);
  assert.deepEqual(Object.values(raw.facts).map(f=>f.value),[6499,32,1024,1.5]);
  assert.equal(candidates.length,1);assert.ok(Object.values(candidates[0].facts).every(f=>f.status==='cited'));
  bindMerchantImages(candidates,[s]);assert.equal(candidates[0].media.sourceUrl,url);assert.equal(candidates[0].media.images.length,1);
  assert.equal(merchantRawCandidate(s,{fields:[{key:'time',label:'续航',type:'number',unit:'小时'}]}).facts.time,undefined);
  const storage={fields:[{key:'capacity',label:'固态硬盘容量',type:'number',unit:'GB'}]};
  assert.equal(merchantRawCandidate(s,storage).facts.capacity.value,1024);
  s.merchantObservation.attributes=s.merchantObservation.attributes.filter(a=>a.label!=='硬盘类型');assert.equal(merchantRawCandidate(s,storage).facts.capacity,undefined);
});

test('phone parameter labels keep runtime RAM and device storage separate in an Agent-selected schema',()=>{
 const mobileSchema={fields:[{key:'cost',label:'价格',unit:'元',direction:-1},{key:'memory',label:'运行内存',unit:'GB',direction:1},{key:'capacity',label:'存储容量',unit:'GB',direction:1}]};
 const o=parseMerchantDetail(snapshot,{url:snapshot.url,cells:['运行内存：8GB','机身内存：256GB']});
 const s={id:'phone',url:o.url,text:o.text,title:o.name,merchantObservation:o};
 const raw=merchantRawCandidate(s,mobileSchema);assert.equal(raw.facts.memory.value,8);assert.equal(raw.facts.capacity.value,256);
 const checked=checkDecisionCandidates([raw],[s],mobileSchema);assert.equal(checked.candidates[0].facts.memory.status,'cited');assert.equal(checked.candidates[0].facts.capacity.status,'cited');
});
test('different seller or product cannot supply parameters or source photographs',()=>{
  const o=parseMerchantDetail(snapshot,{...spec,url:spec.url.replace('123456','123457')});assert.equal(o.attributes.length,0);
  const s=source(),other={id:'b',url:url.replace('123456','123457'),text:'other'};
  assert.equal(attachMerchantPage(other,{merchantObservation:o}),false);
  const candidates=[{name:'另一配置',sourceId:'a'}];bindMerchantImages(candidates,[s]);assert.equal(candidates[0].media,undefined);
  const duplicate=source();duplicate.merchantObservation.attributes.push({label:'内存容量',value:'16GB',quote:'内存容量：16GB'});duplicate.text+='\n内存容量：16GB';
  assert.equal(merchantRawCandidate(duplicate,schema).facts.ram,undefined);
  assert.equal(parseMerchantDetail({...snapshot,priceContext:'国补后 ¥6499.00'},spec).offer,null);
});
test('actual graph executes an Agent-selected catalog category and binds complete products without an offsite search or guessed extraction',async()=>{
 const requests=[];const catalog='https://search.suning.com/testing/';
 const plan={schema:{fields:schema.fields.map(f=>({...f,direction:['cost','mass'].includes(f.key)?-1:1})),layout:{primaryField:'cost'}},constraints:[{field:'cost',value:7000,quote:'价格不超过7000元'}],queries:['fallback'],catalogRequests:[{platform:'suning',keywords:'测试商品类别'}],whatifs:[]};
 const urls=Array.from({length:4},(_,i)=>url.replace('123456',String(123456+i)));
 const result=await runGeneralResearch('价格不超过7000元；比较内存、硬盘和重量，需要来源图片',{
   publicCatalogs:[{platform:'suning'}],async searchCatalog(request){requests.push(request);return {url:catalog,title:'测试目录',text:'测试目录',observedLinks:urls.map(u=>({url:u,title:'测试配置'}))};},
   async model(messages){const system=messages[0].content;if(system.includes('Analyze this individual'))return plan;if(system.includes('Select up to 6'))return {urls};if(system.includes('Propose 2 or 3'))return {whatifs:[]};if(system.includes('Analyze ONLY'))return {summary:'',insights:[]};throw new Error('Unexpected extraction');},
   async search(){assert.fail('observed catalog should not need an offsite search');},
   async fetchSource(target){if(target===catalog)return {url:catalog,text:'测试目录',observedLinks:urls.map(u=>({url:u,title:'测试配置'}))};const o=parseMerchantDetail({...snapshot,url:target,productTitle:'测试配置'+target.split('/').pop()},null);o.attributes=spec.cells.filter(s=>!s.includes('最大')).map(s=>{const [label,value]=s.split('：');return {label,value,quote:s};});o.text+='\n'+o.attributes.map(a=>a.quote).join('\n');return {text:o.text,merchantObservation:o};}
 });
 assert.deepEqual(requests,[{platform:'suning',keywords:'测试商品类别'}]);assert.equal(result.candidates.length,4);assert.ok(result.candidates.every(c=>c.media?.url&&Object.values(c.facts).every(f=>f.status==='cited')));
});
test('catalog routing allows public search only and does not accept authentication or private destinations',()=>{
  assert.ok(merchantCatalogUrl('https://search.suning.com/笔记本/'));
  for(const raw of ['http://search.suning.com/abc/','https://search.suning.com:123/abc/','https://user:password@search.suning.com/abc/','https://example.com/abc/'])assert.equal(merchantCatalogUrl(raw),null);
});
test('split currency/integer/cents use the same primary DOM element text while conditional prices remain rejected',()=>{
 const split={...snapshot,priceText:'¥\n6499\n.99',priceDOMText:'¥6499.99',text:'¥\n6499\n.99\n无货'};
 const o=parseMerchantDetail(split,spec);assert.equal(o.offer.value,6499.99);assert.equal(o.offer.quote,'¥6499.99');assert.ok(o.text.includes('商品主价格DOM文本\n¥6499.99'));
 assert.equal(parseMerchantDetail({...split,priceContext:'会员价¥6499.99'},spec).offer,null);
 assert.equal(parseMerchantDetail({...split,priceDOMText:'¥6??9.99'},spec).offer,null);
});
test('unconstrained entity names are identity metadata; removing them never introduces an image requirement or removes a brand preference',()=>{
 const fields=[{key:'name',label:'品牌型号',type:'enum',options:[]},...schema.fields];
 const plan=normalizeResearchPlan({schema:{fields,layout:{primaryField:'name'}},constraints:[]});
 assert.deepEqual(plan.schema.fields,schema.fields);assert.equal(plan.evidenceRequirements,undefined);
 assert.equal(normalizeResearchPlan({schema:{fields},constraints:[{field:'name',value:'某品牌'}]}).schema.fields.length,fields.length);
 const linked=normalizeResearchPlan({schema:{fields:[...fields,{key:'link',label:'商品来源链接',type:'string',direction:0}]},constraints:[]});assert.deepEqual(linked.schema.fields,schema.fields);assert.equal(linked.evidenceRequirements,undefined);
});
test('omitted catalog selection receives one compact Agent turn and filters unsupported platforms without inventing a category',async()=>{
 const calls=[];const result=await planDecision('比较测试商品，价格不超过7000元',{
   publicCatalogs:[{platform:'suning'}],searchCatalog:async()=>{},async model(messages){calls.push(messages[0].content);
     if(calls.length===1)return {schema:{fields:[{key:'cost',label:'价格',unit:'元',direction:-1}]},constraints:[{field:'cost',value:7000,quote:'价格不超过7000元'}],queries:['test'],whatifs:[{name:'调整预算',changes:[{field:'cost',value:6000}]}]};
     return {catalogRequests:[{platform:'invented',keywords:'invalid'},{platform:'suning',keywords:'模型选择的类别'}]};
   }
 });
 assert.equal(calls.length,2);assert.ok(calls[1].includes('Choose whether'));assert.deepEqual(result.catalogRequests,[{platform:'suning',keywords:'模型选择的类别'}]);
});
test('merchant refresh withdraws stale source photos and prices when the new response is unavailable or only unstructured text',async()=>{
 const s=source(),candidates=checkDecisionCandidates([merchantRawCandidate(s,schema)],[s],schema).candidates;bindMerchantImages(candidates,[s]);
 const previous={schema,candidates,sources:[s]};
 const refreshed=await refreshGeneralEvidence(previous,{fetchSource:async()=>{throw new Error('unavailable');}});
 assert.equal(refreshed.candidates[0].media,undefined);assert.equal(refreshed.sources[0].merchantObservation,undefined);assert.equal(refreshed.sources[0].publicPrice,undefined);
 assert.equal(refreshed.refreshReport.imagesWithdrawn,1);assert.equal(refreshed.candidates[0].facts.cost.status,'unknown');
 const o=parseMerchantDetail({...snapshot,images:['https://imgservice.suning.cn/new-a.jpg']},spec);
 const updated=await refreshGeneralEvidence(previous,{fetchSource:async()=>({text:o.text,merchantObservation:o})});
 assert.equal(updated.candidates[0].media.url,o.images[0]);assert.equal(updated.refreshReport.imagesUpdated,1);
});
