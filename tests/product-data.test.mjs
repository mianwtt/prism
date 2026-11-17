import test from 'node:test';
import assert from 'node:assert/strict';
import {partitionProductData,normalizeMerchantProduct,buildComparisonData} from '../src/product-data.mjs';
import {configurationIssue} from '../src/configuration.mjs';
const raw={key:'fixture',url:'https://m.suning.com/product/000/123.html',retrievedAt:new Date().toISOString(),specificationText:'# TestBook (16GB/512GB)\n- CPU型号Core 5 210H\n- 内存容量16GB\n- 硬盘容量512GB\n- 净重1.64千克\n- 操作系统Windows 11\n- 屏幕分辨率1920×1200\n- 电池锂电池',offer:{status:'observed',value:5199,quote:'¥5199.00',configuration:'TestBook (16GB/512GB)',availability:'out-of-stock',snapshot:{text:'¥5199.00\n无货'}}};
test('only source-backed complete core records enter comparison; stock and unreported runtime do not block',()=>{
 const p=normalizeMerchantProduct(raw);
 assert.equal(p.status,'comparison-ready');assert.equal(p.fields.priceCNY.value,5199);
 assert.equal(p.runtimeHours.status,'not-reported-in-captured-source');assert.equal(p.price.stockIsBlocking,false);
 for(const fact of Object.values(p.fields))assert.ok(p.sources.find(s=>s.id===fact.sourceId).text.includes(fact.quote));
});
test('missing prices remain research drafts rather than placeholder comparison rows',()=>{
 const p=partitionProductData([raw,{...raw,key:'incomplete',offer:{status:'no-readable-price'}}]);
 assert.equal(p.comparisonReady.length,1);assert.equal(p.researchDrafts.length,1);
 assert.ok(p.researchDrafts[0].blockers.includes('missing:priceCNY'));
});
test('explicit configuration mismatches cannot pass completeness even when every field is present',()=>{
 const p=normalizeMerchantProduct({...raw,specificationText:raw.specificationText.replace('# TestBook (16GB/512GB)','# TestBook (16GB/1TB)')});
 assert.equal(p.status,'research-draft');assert.match(p.blockers[0],/不能混用/);
});
test('merchant G capacity notation, processor variants and manufacturer codes cannot be merged',()=>{
 assert.match(configurationIssue('HP 210H 16GB/512GB','HP 210H 16G 1TB'),/不能混用/);
 assert.match(configurationIssue('小新16 8845H 16GB/512GB','小新16 5800H 16G 512G'),/处理器/);
 assert.match(configurationIssue('HP 16-bu0152TU','HP 16-bu0153TU'),/厂家/);
});
test('graph output groups dynamic price and specification snapshots by the same merchant product id',()=>{
 const sources=[{id:'spec',url:'https://www.suning.com/itemcanshu/000/123.html',title:raw.offer.configuration,text:raw.specificationText,kind:'page'},
 {id:'price',url:raw.url,title:raw.offer.configuration,text:raw.offer.snapshot.text,retrievedAt:raw.retrievedAt,kind:'page'}];
 const data=buildComparisonData([{id:'real',name:raw.offer.configuration,priceObservations:[{...raw.offer,kind:'merchant-listed',sourceId:'price'}]}],sources);
 assert.equal(data.comparisonReady.length,1);assert.equal(data.comparisonReady[0].fields.weightKg.value,1.64);
 sources[0].url='https://www.suning.com/itemcanshu/000/999.html';
 assert.equal(buildComparisonData([{id:'real',name:raw.offer.configuration,priceObservations:[{...raw.offer,kind:'merchant-listed',sourceId:'price'}]}],sources).comparisonReady.length,0);
});
