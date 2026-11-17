import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSuningSnapshot,suningMobileUrl} from '../src/merchant-browser.mjs';
import {assessPurchaseComparison} from '../src/purchase-acceptance.mjs';
test('mobile product routing keeps seller and product identities and rejects unrelated sites',()=>{
 assert.equal(suningMobileUrl('https://www.suning.com/itemcanshu/0000000000/12451481237.html'),'https://m.suning.com/product/0000000000/12451481237.html');
 assert.equal(suningMobileUrl('https://example.com/item/123.html'),null);
});
test('visible product price preserves out-of-stock and region rather than inventing a purchase offer',()=>{
 const snapshot={title:'惠普16-bu0152TU 16G 512G',priceText:'¥5199.00',text:'¥5199.00\n无货\n送至\n河南 郑州 中原区\n实际优惠金额以结算页下单金额为准'};
 const offer=parseSuningSnapshot(snapshot);
 assert.equal(offer.value,5199);assert.equal(offer.availability,'out-of-stock');assert.equal(offer.productKey,'HP:BU0152TU');
 assert.equal(offer.region,'河南 郑州 中原区');
 assert.equal(parseSuningSnapshot({...snapshot,text:snapshot.text.replace('河南 郑州 中原区','选择其他地址')}).region,null);
 assert.notEqual(parseSuningSnapshot({...snapshot,priceText:'¥6??8'}).status,'observed');
 const assessment=assessPurchaseComparison('HP:BU0152TU',[{...offer,url:'https://m.suning.com/product/000/123.html',retrievedAt:new Date().toISOString()}]);
 assert.equal(assessment.status,'failed');assert.equal(assessment.acceptedPlatforms.length,1);
 assert.equal(assessment.observations[0].accepted,true);
 assert.ok(assessment.observations[0].notes.includes('所选地区无货')||assessment.observations[0].notes.includes('页面显示无货'));
});
test('two URLs from one platform cannot pass the two-platform gate; different variants also fail',()=>{
 const offer={kind:'merchant-listed',value:5199,productKey:'HP:BU0152TU',availability:'in-stock',region:'测试地区',termsVerified:true,retrievedAt:new Date().toISOString(),url:'https://item.jd.com/123.html'};
 assert.equal(assessPurchaseComparison(offer.productKey,[offer,{...offer,url:'https://item.m.jd.com/ware/view.action?wareId=123'}]).status,'failed');
 assert.equal(assessPurchaseComparison(offer.productKey,[offer,{...offer,productKey:'HP:BU0153TU',url:'https://m.suning.com/product/000/123.html'}]).status,'failed');
 assert.equal(assessPurchaseComparison(offer.productKey,[offer,{...offer,url:'https://m.suning.com/product/000/123.html'}]).status,'passed');
});
test('the public price parser accepts other product categories and does not use laptop price bounds',()=>{
 const result=parseSuningSnapshot({title:'虚构配件',priceText:'¥49.90',text:'¥49.90\n无货'});assert.equal(result.status,'observed');assert.equal(result.value,49.9);assert.equal(result.availability,'out-of-stock');
});
