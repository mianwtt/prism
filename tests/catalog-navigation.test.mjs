import test from 'node:test';import assert from 'node:assert/strict';
import {parseRentalCatalog} from '../src/public-rental-read.mjs';
import {refineObservedCatalogs,catalogRequestForConditions,readCatalogWithRetry} from '../src/catalog-navigation.mjs';
import {runGeneralResearch} from '../src/general-research.mjs';
import {rentalHtml,rentalPlan} from './fixtures/rental-page.mjs';
import {parseRentalCities,rentalCityIndexURL} from '../src/public-rental-read.mjs';
const root='https://m.fang.com/zf/hz/m0/',filter='https://m.fang.com/zf/hz/p3m0/';
const html='<title>测试租房目录</title><a href="/zf/hz/p3m0/">2000-3000元/月</a><a href="/zf/sz/p3m0/">外地目录</a><a href="https://evil.example/">推荐</a><a href="/user/login">登录</a><li><a href="/zf/hz/3_123456789.html">软件测试公寓 3200元/月</a></li>';

test('catalog discovery retries a transient connection once, but never retries invalid input or loops after repeated timeouts',async()=>{
 let calls=0,retries=0;
 const page=await readCatalogWithRetry({platform:'test'},{searchCatalog:async()=>{if(++calls===1)throw new Error('房源读取超时');return {text:'公开目录'};}},{onRetry:()=>retries++});
 assert.equal(page.text,'公开目录');assert.equal(calls,2);assert.equal(retries,1);
 calls=0;await assert.rejects(readCatalogWithRetry({}, {searchCatalog:async()=>{calls++;throw new Error('无效的租房城市');}}));assert.equal(calls,1);
 calls=0;await assert.rejects(readCatalogWithRetry({}, {searchCatalog:async()=>{calls++;throw new Error('ETIMEDOUT');}}));assert.equal(calls,2);
});
test('catalog filters must be observed, same-city, public routes; an empty result can still expose useful filters',()=>{
 const page=parseRentalCatalog(html,root);assert.deepEqual(page.observedCatalogLinks,[{url:filter,title:'2000-3000元/月',kind:'catalog'}]);
 assert.equal(parseRentalCatalog(html.replace(/<li>[\s\S]*?<\/li>/,''),root).observedCatalogLinks.length,1);
});
test('catalog navigation retries invalid selection within bounds and never reads an invented filter',async()=>{
 let calls=0;const visited=[],page=parseRentalCatalog(html,root);
 const result=await refineObservedCatalogs([{id:'a',...page}],{schema:{fields:[]},settings:{}},{async model(){return {urls:[++calls===1?'https://unobserved.example/filter':filter]};},async fetchSource(url){visited.push(url);return {url,title:'筛选后目录',text:'已观察到的目录',observedLinks:[]};}});
 assert.equal(calls,2);assert.deepEqual(visited,[filter]);assert.equal(result.calls.read,1);
});
test('actual graph follows the supplied platform filter before selecting affordable detail rows',async()=>{
 const detailUrls=[1,2,3].map(n=>'https://zu.fang.com/hz/chuzu/3_12345678'+n+'_1.htm'),reads=[];
 const plan=structuredClone(rentalPlan);plan.schema.fields=plan.schema.fields.filter(f=>f.key!=='stationWalk');
 const result=await runGeneralResearch('月租不超过4000元/月，面积至少30㎡，需要原页图片',{
   async search(){return [{url:root,title:'目录'}];},
   async model(messages){const p=messages[0].content;if(p.startsWith('Analyze this individual'))return plan;if(p.includes('observed catalog filter URLs'))return {urls:[filter]};if(p.startsWith('Select up to 6'))return {urls:detailUrls};if(p.startsWith('Analyze ONLY'))return {summary:'',insights:[]};throw new Error('Unexpected model call');},
   async fetchSource(url){reads.push(url);if(url===root)return parseRentalCatalog(html,root);if(url===filter)return {url,title:'低价房源目录',text:'低价房源',observedLinks:detailUrls.map(url=>({url,title:'软件测试公寓 3200元/月'}))};
    const {parseRentalPage}=await import('../src/public-rental-read.mjs');const o=parseRentalPage(rentalHtml,url);return {text:o.text,title:o.title,pageIdentity:{name:o.name},rentalObservation:o};}
 });
 assert.deepEqual(reads.slice(0,2),[root,filter]);assert.equal(result.candidates.length,3);assert.ok(result.candidates.every(c=>c.media?.url));assert.equal(result.agent.recovery.stopReason,'not-needed');
});
test('only an unambiguous Agent-selected currency ceiling maps to supported catalog price controls',()=>{
 const request={platform:'suning',keywords:'任意商品类别'},platforms=[{platform:'suning',capabilities:['price-range','price-ascending']}];
 const contract={schema:{fields:[{key:'cost',label:'费用',type:'number',unit:'元',direction:-1}]},settings:{limits:{cost:5000}}};
 assert.equal(catalogRequestForConditions(request,contract,[]),request);
 contract.schema.fields[0].label='价格';assert.deepEqual(catalogRequestForConditions(request,contract,platforms),{...request,priceRange:{minimum:0,maximum:5000}});
 contract.schema.fields.push({key:'other',label:'报价',unit:'元',direction:-1});contract.settings.limits.other=6000;assert.equal(catalogRequestForConditions(request,contract,platforms),request);
});
test('successive filters compose from the newly observed page and the most specific catalog takes priority',async()=>{
 const whole='https://m.fang.com/zf/hz/m0/',priced='https://m.fang.com/zf/hz/p3m0/',visited=[];
 const initial={id:'a',url:'https://m.fang.com/zf/hz/',observedCatalogLinks:[{url:whole,title:'整租'},{url:'https://m.fang.com/zf/hz/p3/',title:'2000-3000元/月'}]};
 let calls=0;const result=await refineObservedCatalogs([initial],{schema:{fields:[]},settings:{}},{model:async()=>({urls:[++calls===1?whole:priced]}),fetchSource:async url=>{visited.push(url);return {url,title:'目录',text:'实际目录',observedLinks:[],observedCatalogLinks:url===whole?[{url:priced,title:'2000-3000元/月'}]:[]};}});
 assert.deepEqual(visited,[whole,priced]);assert.deepEqual(result.sources.map(s=>s.url),[priced,whole]);assert.equal(result.calls.read,2);
});
test('rental city routing comes from observed public city links rather than a fixed city table',()=>{
 const html='<a href="/zf/newtown/">测试城市</a><a href="/zf/sh/">上海</a><a href="https://other.example/zf/bj/">北京</a><a href="/user/login">登录</a>';
 assert.deepEqual(parseRentalCities(html),[{name:'测试城市',url:'https://m.fang.com/zf/newtown/'},{name:'上海',url:'https://m.fang.com/zf/sh/'}]);assert.ok(rentalCityIndexURL.startsWith('https://m.fang.com/city/'));
});

test('price-first navigation can use a third observed step to restore price after entering the rental type',async()=>{
 const priced='https://m.fang.com/zf/gz/p3/',whole='https://m.fang.com/zf/gz/m0/',combined='https://m.fang.com/zf/gz/p3m0/',visited=[];
 const chain=[priced,whole,combined];let selections=0;
 const result=await refineObservedCatalogs([{url:'https://m.fang.com/zf/gz/',observedCatalogLinks:[{url:priced,title:'价格区间'}]}],{schema:{fields:[]},settings:{}},{
  model:async()=>({urls:[chain[selections++]]}),
  fetchSource:async url=>{visited.push(url);return {url,text:'构造目录',title:'构造目录',observedLinks:[],observedCatalogLinks:url===priced?[{url:whole,title:'整租'}]:url===whole?[{url:combined,title:'已保留整租的价格区间'}]:[]};}
 });
 assert.deepEqual(visited,chain);assert.equal(result.calls.read,3);assert.equal(result.sources[0].url,combined);
});
