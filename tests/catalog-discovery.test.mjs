import test from 'node:test';
import assert from 'node:assert/strict';
import {selectCatalogProducts,catalogProductFits} from '../src/catalog-discovery.mjs';
import {completeFixture} from './browser/complete-space.fixture.mjs';
import {runResearch} from '../src/research-agent.mjs';

test('catalog selection keeps full product titles, excludes irrelevant RAM/gaming entries and distributes brands',()=>{
 const items=[{name:'惠普 星Book14 (16G 512G) 轻薄笔记本',url:'https://product.suning.com/000/123.html'},
 {name:'2500+评价',url:'https://product.suning.com/000/123.html'},
 {name:'戴尔 灵越14 16G 512G 轻薄笔记本',url:'https://product.suning.com/000/124.html'},
 {name:'惠普 星Book16 (16G 512G) 轻薄笔记本',url:'https://product.suning.com/000/125.html'},
 {name:'联想 异能者P16H (8G 512G) 笔记本电脑',url:'https://product.suning.com/000/126.html'},
 {name:'联想 拯救者RTX5060 32G 1T 游戏笔记本',url:'https://product.suning.com/000/127.html'}];
 const result=selectCatalogProducts(items,{minMemory:16,maxWeight:2,limit:8});
 assert.equal(result.length,3);assert.match(result[0].name,/惠普/);assert.match(result[1].name,/戴尔/);
 assert.ok(result[0].url.startsWith('https://m.suning.com/product/'));assert.ok(result.every(p=>p.name!=='2500+评价'));
});
test('actual graph accepts more than three complete catalog products and retains all quotes without fictional planner calls',async()=>{
 const fixture=completeFixture(),products=[];
 for(let i=0;i<8;i++){
  const product=structuredClone(fixture.candidates[i%2].productData);
  product.id='catalog-test-'+i;product.sourceProductUrl='https://m.suning.com/product/000/'+(200+i)+'.html';
  products.push(product);
 }
 let planner=0;
 const result=await runResearch('预算8000元 至少16GB 2kg以内 笔记本电脑',{async discoverProducts(settings,progress){assert.equal(settings.budget,8000);progress('test catalog read');return{comparisonReady:products,researchDrafts:[],checked:12,discovered:50};},async model(){planner++;throw Error('should not invent candidates');},async search(){throw Error('not needed');}});
 assert.equal(result.candidates.length,8);assert.equal(planner,0);assert.equal(result.agent.catalogDiscovery.checked,12);
 assert.ok(result.trace.some(e=>e.node==='discover'&&e.message==='test catalog read'));
 for(const c of result.candidates)for(const f of Object.values(c.productData.fields))assert.ok(result.sources.find(s=>s.id===f.sourceId)?.text.includes(f.quote));
 for(const c of result.candidates)if(c.media)assert.equal(result.sources.find(s=>s.id===c.media.sourceId)?.image.url,c.media.url);
});
test('catalog completeness alone is insufficient: the requested budget, memory and weight all constrain discovery',()=>{
 const p=completeFixture().candidates[0].productData;
 const settings={budget:6000,minMemory:16,maxWeight:2};
 assert.equal(catalogProductFits(p,settings),true);
 assert.equal(catalogProductFits(p,{...settings,budget:5000}),false);
 assert.equal(catalogProductFits(p,{...settings,minMemory:32}),false);
 assert.equal(catalogProductFits(p,{...settings,maxWeight:1.3}),false);
});
