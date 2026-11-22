import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRentalPage,parseRentalCatalog,rentalCatalogUrl,requestedRentalDistrict,attachRentalPage,rentalRawCandidate,resolveRentalCity} from '../src/public-rental-read.mjs';
import {bindRentalScope,explicitRentalRegion} from '../src/rental-scope.mjs';
import {checkDecisionCandidates,runGeneralResearch} from '../src/general-research.mjs';
import {validateDecisionSchema,validateDecisionSettings,evaluateDecision} from '../src/decision-schema.mjs';
import {catalogRequestForConditions,refineObservedCatalogs} from '../src/catalog-navigation.mjs';
import {importSpace} from '../src/space-import.mjs';
import {refreshGeneralEvidence} from '../src/general-refresh.mjs';
import {assessResearchTask} from '../scripts/lib/research-acceptance.mjs';

const question='在杭州滨江租房，月租不超过4000元，面积至少30平方米，只看整租，需要原房源图片。不限制通勤。';
const baseSchema=validateDecisionSchema({label:'租房比较',optionLabel:'房源',fields:[{key:'rent',label:'月租',unit:'元/月',direction:-1},{key:'area',label:'面积',unit:'㎡',direction:1}]});
const catalog={url:'https://m.fang.com/zf/hz_154/',requestedRegion:{city:'杭州',district:'滨江'},districts:['拱墅','滨江','上城'],cityObservation:{url:'https://m.fang.com/zf/hz/'}};
const makeContract=()=>({question,schema:baseSchema,settings:validateDecisionSettings({limits:{rent:4000,area:30}},baseSchema),whatifs:[{id:'more-rent',settings:validateDecisionSettings({limits:{rent:5000,area:30}},baseSchema)}],evidenceRequirements:{sourcePhotos:true}});
// Parser-only fixtures; none of these names, numbers or pictures enter live data.
function listing(id=123,district='滨江',city='杭州'){
 const url='https://m.fang.com/zf/hz/3_'+id+'.html';
 const html=`<title>滨江名苑${id}租房_公开详情</title><script>var pageConfig={};pageConfig.houseid='${id}';pageConfig.projname='滨江名苑${id}';pageConfig.city='hz';pageConfig.cityname='${city}';${district?`pageConfig.district='${district}';`:''}</script>
 <div class="zf-price">3200元/月</div><ul class="hxStyle-left"><li>面积 40㎡</li><li>整租</li></ul><div class="xqfocusbox"><li data-name="图片"><img src="https://cdnsfb.soufunimg.com/parser-test-only.jpg"></li></div>
 <a href="https://m.fang.com/zf/hz_154/">滨江租房</a><script>pageConfig.houseid='999';pageConfig.cityname='杭州';pageConfig.district='滨江';</script><footer>滨江房源推荐</footer>`;
 const o=parseRentalPage(html,url),source={id:'source-'+id,url,title:o.title,text:o.text,kind:'page',retrievedAt:new Date().toISOString()};
 attachRentalPage(source,{url,text:o.text,pageIdentity:{name:o.name},rentalObservation:o});
 return {html,source,page:{url,text:o.text,title:o.title,pageIdentity:{name:o.name},rentalObservation:o}};
}

test('district recognition is grounded in observed labels and explicit location clauses, not brand names or work locations',()=>{
 const districts=['拱墅','滨江','上城'];
 assert.equal(requestedRentalDistrict(question,districts,'杭州'),'滨江');
 assert.equal(requestedRentalDistrict('在杭州滨江区租房',districts,'杭州'),'滨江');
 assert.equal(requestedRentalDistrict('只看滨江区的整租房源',districts,'杭州'),'滨江');
 for(const request of ['杭州租房，公司在滨江，不限区域','杭州租房，不要滨江','在杭州租房，优先滨江品牌公寓','上海滨江租房'])assert.equal(requestedRentalDistrict(request,districts,'杭州'),null,request);
 assert.equal(requestedRentalDistrict('在南宁青秀租房',['青秀','西乡塘'],'南宁'),'青秀');
});

test('an over-specific model city input resolves through actual city-index labels, without guessing codes or accepting arbitrary URL suffixes',()=>{
 const cities=[{name:'北京',url:'https://m.fang.com/zf/bj/'},{name:'南宁',url:'https://m.fang.com/zf/nn/'}];
 assert.equal(resolveRentalCity(cities,'北京海淀区').url,cities[0].url);assert.equal(resolveRentalCity(cities,'南宁市青秀区').url,cities[1].url);
 assert.equal(resolveRentalCity(cities,'北京/login'),null);assert.equal(resolveRentalCity(cities,'未观察到的城市'),null);
});

test('public region URLs are allowed without admitting fabricated hostnames, credentials or arbitrary paths',()=>{
 assert.equal(rentalCatalogUrl('https://m.fang.com/zf/hz_154/p3/'),'https://m.fang.com/zf/hz_154/p3/');
 for(const url of ['https://m.fang.com.evil.org/zf/hz_154/','https://user@m.fang.com/zf/hz_154/','http://m.fang.com/zf/hz_154/','https://m.fang.com/zf/hz_154/login/'])assert.equal(rentalCatalogUrl(url),null);
});

test('catalog location hints use the district row; a development named 滨江 in 上城 is not a 滨江 listing',()=>{
 const p=parseRentalCatalog('<title>杭州租房</title><section id="district_section"><a data-comarea="154,first">滨江</a><a data-comarea="149,first">上城</a></section><li><a href="/zf/hz/3_123.html"><h3>仁恒滨江园</h3><p><span class="flor">今天</span> 上城 - 仁恒滨江园 </p></a></li>','https://m.fang.com/zf/hz/');
 assert.deepEqual(p.districts,['滨江','上城']);assert.equal(p.observedLinks[0].location.district,'上城');
});

test('only the main listing metadata can supply its city/district; recommendation metadata and footer words cannot',()=>{
 const right=listing(),wrong=listing(124,'拱墅'),missing=listing(125,null);
 assert.equal(right.source.rentalObservation.location.value,'杭州 · 滨江');
 assert.equal(right.source.rentalObservation.observedCatalogLinks[0].url,catalog.url);
 assert.equal(wrong.source.rentalObservation.location.value,'杭州 · 拱墅');
 assert.deepEqual(wrong.source.rentalObservation.observedCatalogLinks,[]);
 assert.equal(missing.source.rentalObservation.location,undefined);
 assert(!wrong.source.text.includes('所在区域：杭州 · 滨江'));
});

test('regional eligibility excludes an outside district and the same district name in another city; missing geography stays unresolved',()=>{
 const contract=bindRentalScope(makeContract(),catalog),sources=[listing().source,listing(124,'拱墅').source,listing(125,'滨江','上海').source,listing(126,null).source];
 const checked=checkDecisionCandidates(sources.map(source=>rentalRawCandidate(source,contract.schema)),sources,contract.schema),rows=evaluateDecision(checked.candidates,contract.settings,contract.schema);
 assert.equal(rows.filter(r=>r.status==='eligible').length,1);
 assert(rows.filter(r=>r.status==='excluded').length>=1);
 assert.equal(rows.filter(r=>r.status==='unresolved').length,2);
 assert.equal(contract.settings.weights.listingRegion,0,'location is a hard filter, not a fabricated district quality score');
 assert.equal(contract.whatifs[0].settings.limits.listingRegion,'杭州 · 滨江');
 assert.equal(makeContract().schema.fields.length,2,'no mutation of the supplied schema');
});

test('new research uses the branch region or its explicit removal instead of restoring the original question location',()=>{
 const contract=bindRentalScope(makeContract(),catalog),platforms=[{platform:'fang-rentals',capabilities:['geographic-scope']}],request={platform:'fang-rentals',location:'杭州'};
 contract.settings.limits.listingRegion='杭州 · 上城';assert.equal(catalogRequestForConditions(request,contract,platforms).scopeValue,'杭州 · 上城');
 contract.settings.limits.listingRegion=null;assert.equal(catalogRequestForConditions(request,contract,platforms).scopeValue,null);
});

test('price/type navigation cannot silently broaden an explicitly selected district back to city-wide offers',async()=>{
 const contract=bindRentalScope(makeContract(),catalog),within=catalog.url+'p3/',outside='https://m.fang.com/zf/hz/m0/',read=[];
 await refineObservedCatalogs([{url:catalog.url,retrieval:{requestedRegion:catalog.requestedRegion,navigationEvidence:{breadcrumb:catalog.url}},observedCatalogLinks:[{url:outside,title:'整租（全市）'},{url:within,title:'区域内租金'}]}],contract,{
  model:async messages=>{const {links}=JSON.parse(messages[1].content);assert.deepEqual(links.map(l=>l.url),[within]);return {urls:[within]};},
  fetchSource:async url=>{read.push(url);return {url,text:'目录',observedLinks:[]};}
 });assert.deepEqual(read,[within]);
});

test('the real graph cannot skip recovery just because three outside-district listings have complete prices, areas and photos',async()=>{
 const bad=[listing(131,'拱墅'),listing(132,'拱墅'),listing(133,'拱墅')],good=[listing(141),listing(142),listing(143)],all=[...bad,...good],reads=[];
 const plan={schema:baseSchema,constraints:[{field:'rent',value:4000,quote:'月租不超过4000元'},{field:'area',value:30,quote:'面积至少30平方米'}],queries:['杭州租房'],whatifs:[{name:'多一些预算',changes:[{field:'rent',value:5000}]}],catalogRequests:[{platform:'fang-rentals',location:'杭州'}]};
 const space=await runGeneralResearch(question,{
  publicCatalogs:[{platform:'fang-rentals',input:'location',capabilities:['geographic-scope']}],
  searchCatalog:async()=>({...catalog,title:'杭州滨江租房',text:'杭州滨江房源目录',observedLinks:all.map(({source:s})=>({url:s.url,title:s.title,summary:s.text}))}),
  search:async()=>[],fetchSource:async url=>{reads.push(url);return all.find(l=>l.source.url===url)?.page;},
  model:async messages=>{const p=messages[0].content;if(p.startsWith('Analyze this individual'))return plan;if(p.startsWith('Select up to 6'))return {urls:bad.map(l=>l.source.url)};if(p.startsWith('There are fewer'))return {urls:good.map(l=>l.source.url)};if(p.startsWith('Analyze ONLY'))return {insights:[]};return {candidates:[],queries:[],urls:[]};}
 });
 assert.equal(space.agent.recovery.before.comparable,0);assert.equal(space.agent.recovery.after.comparable,3);assert(good.every(l=>reads.includes(l.source.url)));
 assert.equal(evaluateDecision(space.candidates,space.settings,space.schema).filter(r=>r.status==='eligible').length,3);
 assert(space.scenarios.every(branch=>branch.settings.limits.listingRegion==='杭州 · 滨江'));
 const restored=importSpace(space);assert.equal(restored.evidenceRequirements.rentalScope.field,'listingRegion');assert.equal(restored.baselineSettings.limits.listingRegion,'杭州 · 滨江');assert.equal(evaluateDecision(restored.candidates,restored.settings,restored.schema).filter(r=>r.status==='eligible').length,3);
});

test('a refreshed source that changes its district withdraws the previous location quote from eligibility',async()=>{
 const contract=bindRentalScope(makeContract(),catalog),original=listing(),changed=listing(123,'拱墅'),{candidates}=checkDecisionCandidates([rentalRawCandidate(original.source,contract.schema)],[original.source],contract.schema);
 const result=await refreshGeneralEvidence({schema:contract.schema,candidates,sources:[original.source],trace:[]},{fetchSource:async()=>changed.page});
 assert.equal(result.candidates[0].facts.listingRegion.status,'unknown');assert.equal(evaluateDecision(result.candidates,contract.settings,contract.schema)[0].status,'unresolved');
});

test('independent task acceptance rejects wrong or unobserved districts even when the Agent schema forgot geography entirely',()=>{
 const sources=[listing(151).source,listing(152,'拱墅').source,listing(153,null).source],{candidates}=checkDecisionCandidates(sources.map(source=>rentalRawCandidate(source,baseSchema)),sources,baseSchema),settings=makeContract().settings;
 const task={criteria:[{kind:'rent',maximum:4000,unit:'元/月'},{kind:'area',minimum:30,unit:'㎡'}],geography:{city:'杭州',district:'滨江'},cityCodes:['hz']};
 const result=assessResearchTask(task,{schema:baseSchema,settings,sources,candidates});
 assert.equal(result.qualified,1);assert.deepEqual(result.rows.map(row=>row.geography),[true,false,false]);
 sources[1].text+=' 所在区域：杭州 · 滨江';
 assert.equal(assessResearchTask(task,{schema:baseSchema,settings,sources,candidates}).qualified,1,'a mention elsewhere in the source cannot override the main metadata');
});

test('an explicit unresolved place remains a user request span, without inventing a district from a work location or vague nearby request',()=>{
 assert.equal(explicitRentalRegion(question,'杭州').requested,'滨江');
 for(const q of ['在杭州租房','在杭州附近租房','在杭州租房，公司在滨江','在杭州滨江租房，不限区域'])assert.equal(explicitRentalRegion(q,'杭州'),null,q);
 const contract=makeContract();contract.evidenceRequirements.unresolvedRentalRegion=explicitRentalRegion(question,'杭州');
 assert.equal(bindRentalScope(contract,catalog).evidenceRequirements.unresolvedRentalRegion,undefined);
});

test('unavailable geography discovery never turns three outside-district details into a successful district-specific result',async()=>{
 const listings=[listing(161,'拱墅'),listing(162,'拱墅'),listing(163,'拱墅')];
 const space=await runGeneralResearch(question,{
  publicCatalogs:[{platform:'fang-rentals',input:'location',capabilities:['geographic-scope']}],
  searchCatalog:async()=>{throw new Error('公开城市目录不可用');},
  search:async()=>listings.map(l=>({url:l.source.url,title:l.source.title,raw_content:l.source.text})),fetchSource:async url=>listings.find(l=>l.source.url===url)?.page,
  model:async messages=>messages[0].content.startsWith('Analyze this individual')?{schema:baseSchema,constraints:[{field:'rent',value:4000,quote:'月租不超过4000元'},{field:'area',value:30,quote:'面积至少30平方米'}],queries:['杭州滨江 租房'],whatifs:[{name:'预算更宽',changes:[{field:'rent',value:5000}]}],catalogRequests:[{platform:'fang-rentals',location:'杭州'}]}:{urls:[],queries:[],candidates:[],insights:[]}
 });
 assert.equal(space.candidates.length,0);assert.equal(space.agent.recovery.before.comparable,0);assert(space.drafts.length>=3);assert(space.warnings.some(w=>w.includes('指定区域')));
});
