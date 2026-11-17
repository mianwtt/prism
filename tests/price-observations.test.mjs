import test from 'node:test';
import assert from 'node:assert/strict';
import {priceObservations,enrichCandidatePrices} from '../src/price-observations.mjs';
import {evaluate,defaultSettings} from '../src/engine.mjs';
import {demoSpace} from '../src/demo.mjs';
test('reference extraction ignores unrelated product prices and never populates a current offer',()=>{
 const c={...demoSpace().candidates[0],name:'惠普星Book16 (16GB/512GB)'};
 c.facts.price={value:null,status:'unknown',quote:'',sourceId:null};
 const sources=[{id:'price',kind:'page',title:'惠普星Book16 (16GB/512GB)',url:'https://detail.zol.com.cn/2162/2161813/param.shtml',text:'推荐商品 ￥9999\n| 电商报价 | [￥6399](https://example.com) |'}];
 c.priceObservations=priceObservations(c,sources);
 assert.equal(c.priceObservations[0].value,6399);
 assert.equal(c.facts.price.value,null);
 assert.notEqual(evaluate([c],{...defaultSettings,calculationMode:'provisional'})[0].status,'eligible');
});
test('a multi-model table binds reference prices to the correct capacity and named variant',()=>{
 const c={name:'华为MateBook14 (24GB/512GB)'};
 const source={id:'table',kind:'page',title:'华为MateBook14 (24GB/512GB/标准版/圆键盘)',url:'https://detail.zol.com.cn/notebook/index2163965.shtml',text:'| 华为MateBook14 (24GB/512GB/柔光版/圆键盘) | ¥7399 |\n| 华为MateBook14 (24GB/512GB/标准版/圆键盘) | ¥6599 |\n| 华为MateBook14 (24GB/1TB/标准版/圆键盘) | ¥7599 |'};
 assert.deepEqual(priceObservations(c,[source]).map(p=>p.value),[6599]);
 source.kind='search-excerpt';assert.equal(priceObservations(c,[source]).length,0);
});
test('mobile reference links must identify the current product, not a recommended product',()=>{
 const source={id:'mobile',kind:'page',title:'华硕无畏16 (16GB/512GB)',url:'https://wap.zol.com.cn/2168/2167295/extraprice_9999.html',text:'[参考价￥9999](https://wap.zol.com.cn/1234/9999999/price.html)\n[参考价￥5599](https://wap.zol.com.cn/2168/2167295/price.html)'};
 assert.deepEqual(priceObservations({name:source.title},[source]).map(p=>p.value),[5599]);
});
test('public listed price participates in explicit What-if even when the page says out of stock',async()=>{
 const c=demoSpace().candidates[0];c.name='惠普星Book16 (16GB/512GB)';
 c.facts.price={value:null,status:'unknown',sourceId:null,quote:''};
 const sources=[{id:'shop',kind:'page',title:'惠普星Book16 (16GB/512GB)',url:'https://www.suning.com/itemcanshu/000/123.html',text:'参数'}];
 await enrichCandidatePrices([c],sources,{readMerchantOffer:async()=>({status:'observed',kind:'merchant-listed',value:5199,quote:'¥5199.00',configuration:c.name,availability:'out-of-stock',region:null,retrievedAt:new Date().toISOString(),snapshot:{url:'https://m.suning.com/product/000/123.html',title:c.name,text:'¥5199.00\n无货'}})});
 assert.equal(c.facts.price.value,5199);assert.equal(c.facts.price.status,'unreviewed');
 assert.equal(evaluate([c],{...defaultSettings,calculationMode:'provisional'})[0].status,'eligible');
 assert.equal(evaluate([c],{...defaultSettings,budget:5000,calculationMode:'provisional'})[0].status,'excluded');
});
