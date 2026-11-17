import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkDecisionCandidates,runGeneralResearch} from '../src/general-research.mjs';
import {validateDecisionSchema} from '../src/decision-schema.mjs';
import {validatedIdentity} from '../src/source-reconciliation.mjs';
import {dimensionExcerpt,prioritizeSources} from '../src/general-retrieval.mjs';
import {appendPublicPrice} from '../src/public-product-read.mjs';
const schema=validateDecisionSchema({fields:[{key:'price',label:'价格',unit:'元',direction:-1},{key:'memory',label:'内存',unit:'GB',direction:1}]});
function row(id,host,name,price,memory,code='ABC1000-X'){
  const identityQuote=`${name} SKU ${code}`;
  const source={id,url:`https://${host}/product/${id}`,title:name,kind:'page',text:`${identityQuote}。${price?'价格'+price+'元。':''}${memory?'内存'+memory+'GB。':''}`};
  const raw={name,sourceId:id,identity:{namespace:'product-model',value:code,quote:identityQuote},facts:{...(price?{price:{value:price,quote:'价格'+price+'元',sourceId:id}}:{}),...(memory?{memory:{value:memory,quote:'内存'+memory+'GB',sourceId:id}}:{})}};
  return {source,raw};
}
test('labeled fictional corpus checks exact units, conditional prices, polarity and fabricated quotes',async()=>{
  const cases=JSON.parse(await readFile(new URL('./fixtures/decision-evidence-corpus.json',import.meta.url),'utf8'));
  for(const c of cases){
    const one=validateDecisionSchema({fields:[c.field]}),source={id:'fixture',title:c.title||'测试方案甲',text:c.sourceText||'测试方案甲 '+c.quote,url:'https://example.org/fictional-validation-fixture'};
    const result=checkDecisionCandidates([{name:'测试方案甲',sourceId:source.id,facts:{[c.field.key]:{value:c.value,quote:c.quote,sourceId:source.id}}}],[source],one);
    assert.equal(result.candidates.some(candidate=>candidate.facts[c.field.key]?.value===c.value),c.accept,c.id);
  }
});
test('matching explicit identifiers combine complementary sources and preserve disagreements rather than choose a price',()=>{
  const a=row('a','manufacturer.example.org','测试电脑甲',null,24),b=row('b','merchant.example.com','测试电脑甲 商家配置',5000,24),c=row('c','second.example.net','测试电脑甲 对照配置',5100,24);
  const consistent=checkDecisionCandidates([a.raw,b.raw],[a.source,b.source],schema);
  assert.equal(consistent.candidates.length,1);assert.equal(consistent.candidates[0].facts.price.value,5000);assert.equal(consistent.candidates[0].facts.memory.evidence.length,2);
  const conflict=checkDecisionCandidates([a.raw,b.raw,c.raw],[a.source,b.source,c.source],schema);
  assert.equal(conflict.candidates.length,1);assert.equal(conflict.candidates[0].facts.price.value,null);assert.equal(conflict.candidates[0].facts.price.conflictingEvidence.length,2);assert.equal(conflict.warnings.length,1);
});
test('names, family identifiers, configuration tuples and different-host listing IDs are insufficient for a global merge',()=>{
  const a=row('a','one.example.org','同名方案',5000,16),b=row('b','two.example.com','同名方案',5000,32);
  delete a.raw.identity;delete b.raw.identity;
  assert.equal(checkDecisionCandidates([a.raw,b.raw],[a.source,b.source],schema).candidates.length,2);
  assert.equal(validatedIdentity({namespace:'product-model',value:'16GB512GB',quote:'同名方案 SKU 16GB512GB'},'同名方案',{...a.source,text:'同名方案 SKU 16GB512GB'}),null);
  assert.equal(validatedIdentity({namespace:'product-model',value:'ABC1000-X',quote:'同名方案 ABC1000-X'},'同名方案',{...a.source,text:'同名方案 ABC1000-X'}),null);
  const c=row('c','one.example.org','同名房源',3000,24),d=row('d','two.example.org','同名房源',3000,24);c.raw.identity.namespace=d.raw.identity.namespace='listing';
  assert.equal(checkDecisionCandidates([c.raw,d.raw],[c.source,d.source],schema).candidates.length,2);
});
test('dimension-aware excerpts retain late fields and source selection gives merchant detail pages priority',()=>{
  const text='导航 '.repeat(1800)+'\nSKU ABC1000-X\n内存24GB\n价格5000元';
  const excerpt=dimensionExcerpt(text,schema);assert.ok(excerpt.includes('价格5000元'));assert.ok(excerpt.includes('内存24GB'));assert.ok(excerpt.includes('omitted'));
  const news={id:'news',url:'https://news.example.org/article',title:'上市新闻',text:'价格5000元 内存24GB'},merchant={id:'shop',url:'https://m.suning.com/product/000/123456.html',title:'具体商品',text:'价格5000元 内存24GB'};
  assert.equal(prioritizeSources([news,merchant],schema)[0].id,'shop');
});
test('the real graph fills missing evidence with bounded targeted research and attaches only a cited detail-page image',async()=>{
  const a=row('a','maker.example.org','测试电脑甲',null,24),b=row('b','shop.example.com','测试电脑甲',5000,24);let searches=0,images=0;
  const io={search:async()=>{searches++;const s=searches===1?a.source:b.source;return [{url:s.url,title:s.title,content:s.text}];},fetchSource:async url=>[a.source,b.source].find(s=>s.url===url).text,
    enrichImages:async urls=>{images++;return [{sourceUrl:urls[0],pageUrl:urls[0],url:'https://images.example.org/fictional-computer.png'}];},
    model:async messages=>{const prompt=messages[0].content,input=JSON.parse(messages[1].content);if(prompt.startsWith('Analyze this'))return {schema,queries:['具体型号 参数']};if(prompt.startsWith('Propose'))return {whatifs:[]};if(prompt.startsWith('Analyze ONLY'))return {summary:'基于保存的引用比较。',insights:[]};return {candidates:input.sources.map(s=>{const raw=structuredClone(s.url===a.source.url?a.raw:b.raw);raw.sourceId=s.id;for(const f of Object.values(raw.facts))f.sourceId=s.id;return raw;})};}};
  const result=await runGeneralResearch('比较测试电脑，预算6000元',io);
  assert.equal(searches,2);assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].facts.price.value,5000);assert.equal(result.candidates[0].facts.memory.evidence.length,2);assert.equal(images,1);assert.equal(result.candidates[0].media.kind,'page-preview');assert.ok(result.trace.some(e=>e.node==='corroborate'));
});
test('cross-source follow-up creates a branch-local combined record without changing baseline facts',async()=>{
  const a=row('a','maker.example.org','测试电脑甲',5000,24),b=row('b','shop.example.com','测试电脑甲 店铺配置',5100,24);
  const settings={limits:{price:6000,memory:16},weights:{price:1,memory:1}};
  const original=checkDecisionCandidates([a.raw],[a.source],schema).candidates[0];
  const baseline={id:'scenario-baseline',name:'当前情况',settings,candidateIds:[original.id]},branch={...structuredClone(baseline),id:'branch',parentScenarioId:baseline.id,name:'核对其他来源'};
  const previous={title:'虚构测试',question:'比较测试电脑，预算6000元',mode:'live',schema,settings,baselineSettings:structuredClone(settings),baselineCandidateIds:[original.id],scenarios:[baseline,branch],sources:[a.source],candidates:[original],trace:[]},before=structuredClone(previous);
  const io={search:async()=>[{...b.source,content:b.source.text}],model:async messages=>{const input=JSON.parse(messages[1].content);if(messages[0].content.startsWith('Analyze this'))return {schema,queries:['核对标识']};if(messages[0].content.startsWith('Propose'))return {whatifs:[]};if(messages[0].content.startsWith('Analyze ONLY'))return {summary:'核对分歧',insights:[]};return {candidates:input.sources.map(s=>{const raw=structuredClone(b.raw);raw.sourceId=s.id;for(const f of Object.values(raw.facts))f.sourceId=s.id;return raw;})};}};
  const result=await runGeneralResearch(previous.question,io,()=>{},{previous,scenarios:previous.scenarios,scenario:branch});
  assert.deepEqual(previous,before);assert.equal(result.candidates[0].facts.price.value,5000);assert.deepEqual(result.baselineCandidateIds,[original.id]);
  const combined=result.candidates.at(-1);assert.equal(combined.facts.price.value,null);assert.equal(combined.facts.price.conflictingEvidence.length,2);assert.ok(result.scenarios[1].candidateIds.includes(combined.id));assert.ok(!result.scenarios[1].candidateIds.includes(original.id));
});
test('same merchant product can bind its parameter page and public price without treating stock as an eligibility gate',async()=>{
  const a={id:'params',title:'虚构参数页',url:'https://www.suning.com/itemcanshu/000/123456789.html',kind:'page',text:'测试电脑甲(16GB)\n内存容量16GB\n净重1.64千克'},b={id:'mobile',title:'测试电脑甲 (16GB)',url:'https://m.suning.com/product/000/123456789.html',kind:'page',text:'测试电脑甲(16GB)\n内存容量16GB\n净重1.64千克'};
  const price='¥5199.00',text=price+'\n测试电脑甲(16GB)\n无货';
  const io={readMerchantOffer:async()=>({status:'observed',value:5199,quote:price,configuration:'测试电脑甲(16GB)',availability:'out-of-stock',snapshot:{url:b.url,text},retrievedAt:new Date().toISOString()})};
  assert.equal(await appendPublicPrice(a,schema,io),true);
  const contract=validateDecisionSchema({fields:[...schema.fields,{key:'weight_g',label:'重量',unit:'g',direction:-1}]});
  const result=checkDecisionCandidates([{name:'测试电脑甲 (16GB)',sourceId:a.id,facts:{price:{value:null,sourceId:a.id,quote:''},memory:{value:16,sourceId:a.id,quote:'内存容量16GB 最大支持16GB'},weight_g:{value:1640,sourceId:b.id,quote:'净重1.64千克'}}}],[a,b],contract);
  assert.equal(result.candidates.length,1);const c=result.candidates[0];assert.equal(c.facts.price.value,5199);assert.equal(c.facts.memory.value,16);assert.equal(c.facts.weight_g.value,1640);assert.equal(c.facts.memory.quote,'内存容量16GB');
  // A different seller/product URL cannot donate a value to this candidate.
  b.url='https://m.suning.com/product/000/987654321.html';
  const wrong=checkDecisionCandidates([{name:'测试电脑甲 (16GB)',sourceId:a.id,facts:{memory:{value:16,sourceId:a.id,quote:'内存容量16GB'},weight_g:{value:1640,sourceId:b.id,quote:'净重1.64千克'}}}],[a,b],contract);
  assert.equal(wrong.candidates[0].facts.weight_g.value,null);
});
