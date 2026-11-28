import test from 'node:test';
import assert from 'node:assert/strict';
import {commerceFixture,productPage,sourceFromPage} from './helpers/commerce-fixture.mjs';
import {productDescriptor,offerComparison,checkedOffers,attachOfferComparisons,offerSelectionBranch} from '../src/product-offers.mjs';
import {editGeneralSpace} from '../src/general-space.mjs';
import {decisionReport} from '../src/decision-report.mjs';
import {importSpace} from '../src/space-import.mjs';
import {evaluateDecision} from '../src/decision-schema.mjs';
import {runGeneralResearch,checkDecisionCandidates} from '../src/general-research.mjs';
import {structuredProductCandidate} from '../src/public-product-page.mjs';
import {refreshGeneralEvidence} from '../src/general-refresh.mjs';
import {canonicalGtin} from '../src/product-offers.mjs';
import {explicitProductUrls} from '../src/offer-research.mjs';
import {decisionAnswerContext,buildDecisionAnswer} from '../src/decision-answer.mjs';
import {converse} from '../src/conversation.mjs';

test('same manufacturer configuration keeps four offers, rejects conditional and sold-out lows, selects the lowest checked public offer',()=>{
  const {space}=commerceFixture();assert.equal(space.candidates.length,1);const c=space.candidates[0];
  assert.equal(c.facts.price.value,5900);assert.equal(c.commerce.offers.length,4);assert.equal(c.commerce.sourceCount,4);assert.equal(c.commerce.offers.filter(o=>o.comparable).length,2);assert.equal(c.facts.price.conflictingEvidence,undefined);
  assert.equal(c.commerce.offers.find(o=>o.id===c.commerce.bestOfferId).seller,'测试商家乙');assert.ok(c.commerce.offers.every(o=>space.sources.find(s=>s.id===o.sourceId).text.includes(o.quote)));
});
test('model advice receives independently checked merchant prices and can explain the selected quote premium',()=>{
  const {space}=commerceFixture(),c=space.candidates[0],offer=c.commerce.offers.find(o=>o.seller==='测试商家甲'),next=offerSelectionBranch(space,{candidateId:c.id,offerId:offer.id,scenarioId:'scenario-baseline'}),branch=next.scenarios.at(-1),chosen=next.candidates.at(-1);
  const context=decisionAnswerContext(next,branch).candidates.find(c=>c.id===chosen.id);
  assert.equal(context.purchaseSources.currentExtraCost,200);assert.equal(context.purchaseSources.offers.length,4);
  const answer=buildDecisionAnswer({recommendations:[{candidateId:chosen.id,fields:['price'],reason:'当前报价6100元，另一已核对来源5900元，差额200元。'}]},next,branch);
  assert.equal(answer.origin,'model');assert.match(answer.recommendations[0].reason,/差额200元/);assert.equal(chosen.facts.price.value,6100);
});
test('a comparison of checked merchant quotes cannot claim a verified price is missing or launch new research',async()=>{
  const {space}=commerceFixture(),c=space.candidates[0];
  const result=await converse(space,{message:'比较同款商家的报价和差额，不修改条件',scenarioId:space.scenarios[0].id,autoResearch:true},{model:async()=>({reply:'测试商家甲价格未核实。',intent:'research',researchNeeded:true})});
  const turn=result.conversation.at(-1);assert.equal(turn.interaction.kind,'explain');assert.ok(turn.decisionAnswer);assert.doesNotMatch(turn.content,/价格未核实/);assert.match(turn.content,/5900元/);assert.match(turn.content,/6100元/);assert.equal(result.pendingConversationResearch,undefined);assert.equal(result.scenarios.length,space.scenarios.length);
});
test('a similar family name with different or absent configuration cannot donate its price',()=>{
  const {space}=commerceFixture(),c=space.candidates[0],wrong=sourceFromPage(productPage({site:'wrong.example.info',memory:'8GB',price:1000}),'wrong');
  const missing=structuredClone(wrong);missing.id='missing';missing.productObservation.attributes=[];
  const comparison=offerComparison(c,[...space.sources,wrong,missing],space.schema);assert.equal(comparison.offers.length,4);assert.ok(!comparison.offers.some(o=>o.price===1000));
});
test('local seller SKU alone, unbacked metadata and a search snippet cannot establish cross-site identity',()=>{
  const {space}=commerceFixture(),s=structuredClone(space.sources[0]);s.productObservation.model='';s.productObservation.gtin='';assert.equal(productDescriptor(s).identity,null);
  s.productObservation.model='FABRICATED-123456';assert.equal(productDescriptor(s),null);s.productObservation.model='FIXTURE-160512';s.kind='snippet';assert.equal(productDescriptor(s),null);
});
test('GTINs require a check digit and computer family names need CPU, RAM and storage observations',()=>{
  assert.equal(canonicalGtin('4006381333931'),'04006381333931');assert.equal(canonicalGtin('4006381333932'),null);assert.equal(canonicalGtin('123456789'),null);
  const {space}=commerceFixture(),s=structuredClone(space.sources[0]);s.productObservation.attributes=s.productObservation.attributes.filter(a=>a.label!=='处理器');assert.equal(productDescriptor(s).identity,null);
});
test('user-provided detail links seed research, but private and credential-bearing destinations are rejected',()=>{
  assert.deepEqual(explicitProductUrls('比较 https://shop.example.org/product/a 和 https://shop.example.org/product/a。'),['https://shop.example.org/product/a']);
  for(const url of ['https://127.0.0.1/product/a','https://user:pass@example.org/product/a','https://example.local/a','https://example.org:9000/a'])assert.deepEqual(explicitProductUrls(url),[]);
});
test('shipping unknown stays unknown, complete shipping changes the comparison basis without inventing free delivery',()=>{
  const {space}=commerceFixture(),a=sourceFromPage(productPage({price:5800,shipping:200}),'shipping-a'),b=sourceFromPage(productPage({site:'shop-b.example.org',price:5900,shipping:0}),'shipping-b');
  let result=offerComparison({...space.candidates[0],sourceId:a.id},[a,b],space.schema);assert.equal(result.priceBasis,'total');assert.equal(result.bestOfferId,'shipping-b-offer-0');
  b.productObservation.offers[0].shipping=null;result=offerComparison({...space.candidates[0],sourceId:a.id},[a,b],space.schema);assert.equal(result.priceBasis,'listed');assert.equal(result.offers.find(o=>o.sourceId===b.id).shipping,null);
});
test('stale, expired, changed-currency and failed-source offers never win a current price comparison',()=>{
  const {space}=commerceFixture(),s=sourceFromPage(productPage({price:99,observedAt:new Date(Date.now()-25*3600_000).toISOString()}),'old');
  assert.equal(checkedOffers(s,space.schema)[0].comparable,false);s.retrievedAt=new Date().toISOString();s.productObservation.offers[0].currency='USD';assert.equal(checkedOffers(s,space.schema)[0].comparable,false);
  s.productObservation.offers[0].currency='CNY';s.productObservation.offers[0].validUntil='2020-01-01';assert.equal(checkedOffers(s,space.schema)[0].comparable,false);s.refreshStatus='failed';assert.equal(checkedOffers(s,space.schema).length,0);
});
test('a saved price automatically becomes unresolved after its freshness window without waiting for a refresh click',()=>{
  const {space}=commerceFixture(),c=space.candidates[0];c.commerce.offers.find(o=>o.id===c.commerce.selectedOfferId).retrievedAt=new Date(Date.now()-25*3600_000).toISOString();
  const row=evaluateDecision([c],space.settings,space.schema)[0];assert.equal(row.status,'unresolved');assert.ok(row.missing.includes('价格'));
});
test('no usable offer leaves price unknown, and review holds are not bypassed by the offer layer',()=>{
  const {space}=commerceFixture(),c=structuredClone(space.candidates[0]),sources=space.sources.slice(0,1);sources[0].productObservation.offers[0].availability='out-of-stock';
  assert.equal(attachOfferComparisons([c],sources,space.schema)[0].facts.price.value,null);
  sources[0].productObservation.offers[0].availability='in-stock';c.facts.price={value:null,status:'unknown',reviewReason:'独立审查暂缓采用',rejectedEvidence:{sourceId:sources[0].id}};
  assert.equal(attachOfferComparisons([c],sources,space.schema)[0].facts.price.value,null);
});
test('a review hold on a non-anchor seller survives product reconciliation and cannot be reselected as the cheapest quote',()=>{
  const {space}=commerceFixture(),raw=space.sources.map(s=>structuredProductCandidate(s,space.schema));raw[1].facts.price.reviewHold='独立审查暂缓采用';
  const candidate=checkDecisionCandidates(raw,space.sources,space.schema).candidates[0];assert.equal(candidate.facts.price.value,6100);const comparison=offerComparison(candidate,space.sources,space.schema);
  assert.equal(comparison.offers.find(o=>o.sourceId===space.sources[1].id).comparable,false);assert.equal(comparison.bestOfferId,space.sources[0].id+'-offer-0');
});
test('choosing a saved seller creates an evaluated branch without altering baseline facts, conditions or any source',()=>{
  const {space}=commerceFixture(),before=structuredClone(space),c=space.candidates[0],offer=c.commerce.offers[0];
  const next=editGeneralSpace(space,{scenarios:space.scenarios,activeScenarioId:'scenario-baseline',offerSelection:{candidateId:c.id,offerId:offer.id}}),branch=next.scenarios.at(-1),chosen=next.candidates.at(-1);
  assert.deepEqual(space,before);assert.deepEqual(next.sources,space.sources);assert.deepEqual(next.scenarios[0].candidateIds,space.baselineCandidateIds);assert.equal(chosen.facts.price.value,6100);assert.deepEqual(branch.settings,space.settings);assert.equal(branch.parentScenarioId,'scenario-baseline');assert.equal(evaluateDecision([chosen],branch.settings,next.schema)[0].status,'eligible');
  assert.deepEqual(editGeneralSpace(next,{scenarios:next.scenarios,activeScenarioId:branch.id}).scenarios.at(-1).offerChoice,branch.offerChoice);
});
test('forged, cross-scope, conditional, stale and changed-source selections are rejected on the server',()=>{
  const {space}=commerceFixture(),c=space.candidates[0],choose=id=>offerSelectionBranch(space,{candidateId:c.id,offerId:id,scenarioId:'scenario-baseline'});
  assert.throws(()=>choose('not-an-offer'));assert.throws(()=>choose(c.commerce.offers.find(o=>o.basis==='conditional').id));
  space.sources[0].refreshStatus='failed';assert.throws(()=>choose(c.commerce.offers[0].id));
});
test('exports and imports preserve source-specific prices, never a caller forged best-offer decision',()=>{
  const {space}=commerceFixture(),report=decisionReport(space,space.scenarios[0]);assert.match(report,/同款多来源报价/);assert.match(report,/测试商家乙（当前采用）/);assert.match(report,/优惠|会员/);
  const raw=structuredClone(space);raw.candidates[0].commerce.bestOfferId='forged';raw.candidates[0].commerce.offers=[{id:'forged',price:1,comparable:true}];
  const imported=importSpace(raw);assert.equal(imported.candidates[0].commerce.offers.length,4);assert.equal(imported.candidates[0].commerce.bestOfferId,space.candidates[0].commerce.bestOfferId);
});
test('refresh rechecks alternative sellers and removes unavailable quote metadata instead of leaving an old best price active',async()=>{
  const {space,pages}=commerceFixture(),calls=[];const before=structuredClone(space);
  const refreshed=await refreshGeneralEvidence(space,{fetchSource:async url=>{calls.push(url);if(url===pages[1].url)throw new Error('unavailable');return pages.find(p=>p.url===url);}});
  assert.equal(calls.length,4);assert.equal(refreshed.candidates[0].commerce.selectedOfferId,null);assert.equal(refreshed.candidates[0].facts.price.status,'unknown');assert.equal(refreshed.candidates[0].commerce.offers.length,3);assert.deepEqual(space,before);
});
test('the real specialist graph expands an observed model across sources, reads details and retains distinct configurations',async()=>{
  const {space,pages}=commerceFixture(),wrong=productPage({site:'different.example.info',memory:'8GB',price:1000}),queries=[];
  const io={search:async(q,options={})=>{queries.push({q,...options});return options.purpose==='offers'?[...pages.slice(1),wrong].map(p=>({url:p.url,title:p.title,content:'搜索摘要不是报价证据'})):[{url:pages[0].url,title:pages[0].title,content:'线索'}];},fetchSource:async url=>[...pages,wrong].find(p=>p.url===url),model:async messages=>{const prompt=messages[0].content;if(prompt.startsWith('Analyze this'))return {schema:space.schema,queries:['测试电脑 商品'],whatifs:[{name:'更低预算',changes:[{field:'price',value:6000}]}]};if(prompt.startsWith('Independently review'))return {findings:[]};if(prompt.startsWith('Analyze ONLY'))return {insights:[]};return {candidates:[],queries:[],urls:[]};}};
  const result=await runGeneralResearch('比较16GB和8GB两种不同配置的测试电脑，预算7000元，重量不超过2kg。',io);assert.ok(queries.some(q=>q.purpose==='offers'&&q.q.includes('FIXTURE'.toLowerCase())));assert.equal(result.candidates.find(c=>c.name.includes('16GB')).facts.price.value,5900);assert.equal(result.candidates.find(c=>c.name.includes('16GB')).commerce.offers.length,4);assert.ok(result.candidates.some(c=>c.name.includes('8GB')));assert.equal(result.candidates.find(c=>c.name.includes('8GB')).facts.memory.value,8);
  const exact=await runGeneralResearch(space.question,io);assert.ok(!exact.candidates.some(c=>c.facts.memory.value===8));assert.equal(exact.candidates[0].commerce.offers.length,4);
});
