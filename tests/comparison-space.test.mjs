import test from 'node:test';
import assert from 'node:assert/strict';
import {createComparisonSpace} from '../src/comparison-space.mjs';
import {normalizeMerchantProduct} from '../src/product-data.mjs';
import {evaluate} from '../src/engine.mjs';
import {editSpace} from '../src/space-edits.mjs';
function fixture(){return {comparisonReady:[['a','惠普 星Book16',5199,1.64],['b','联想 小新16',4688,1.89]].map(([key,name,price,weight])=>normalizeMerchantProduct({key,url:`https://m.suning.com/product/000/${key==='a'?100:101}.html`,retrievedAt:new Date().toISOString(),specificationText:`# ${name}\n- CPU型号Test 210H\n- 内存容量16GB\n- 硬盘容量512GB\n- 净重${weight}千克\n- 操作系统Windows 11\n- 屏幕分辨率1920×1200`,offer:{status:'observed',value:price,quote:`¥${price}.00`,configuration:name,retrievedAt:new Date().toISOString(),snapshot:{text:`Synthetic test only. ¥${price}.00`}}})),researchDrafts:[]};}
test('complete data becomes a source-backed provisional workspace with an actual budget flip',()=>{
 const data=fixture(),original=structuredClone(data),s=createComparisonSpace(data);
 assert.equal(s.settings.calculationMode,'provisional');assert.equal(s.settings.weights.battery,0);
 assert.equal(s.candidates[0].facts.price.status,'unreviewed');
 assert.equal(evaluate(s.candidates,s.settings)[0].id,'a');
 assert.equal(evaluate(s.candidates,s.scenarios[1].settings)[0].id,'b');
 assert.deepEqual(data,original);
});
test('version edits preserve full parameter provenance and never overwrite source snapshots',()=>{
 const s=createComparisonSpace(fixture());
 const updated=editSpace(s,{settings:s.settings,reviews:[{candidateId:'a',key:'price',value:4999}]});
 assert.equal(updated.candidates[0].facts.price.confirmation,'user-assumption');
 assert.equal(updated.candidates[0].productData.fields.priceCNY.value,5199);
 assert.deepEqual(updated.sources,s.sources);
 assert.throws(()=>createComparisonSpace({comparisonReady:[]}),/没有核心字段完整/);
});
