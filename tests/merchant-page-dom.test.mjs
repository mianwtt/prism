import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {captureMerchantPage} from '../src/merchant-page-dom.mjs';
import {parseMerchantDetail} from '../src/public-merchant-read.mjs';
let browser,page;
before(async()=>{browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage();await page.route('**/*',route=>route.abort());});
after(async()=>{await browser?.close();});
async function read(html){await page.setContent('<title>测试商品</title><div class="price-content"><div class="product-title">测试设备甲</div>'+html+'</div>');const s=await page.evaluate(captureMerchantPage);return parseMerchantDetail({...s,url:'https://m.suning.com/product/000/123456.html'});}
test('primary ordinary price survives a final-price child while coupon and recommended prices never supply it',async()=>{
 const o=await read('<div class="red-price"><span><span><i>¥</i>6569<i>.00</i></span><span class="final-price">到手价￥5569</span></span></div><section class="lazyimg"><p class="red-price">¥9.99</p></section>');
 assert.equal(o.offer.value,6569);assert.equal(o.offer.quote,'¥6569.00');
});
test('a differently styled current price can use its explicitly labeled ordinary-price row, never the final or coupon row',async()=>{
 const o=await read('<section class="price-at-hand"><div class="to-hand-price"><div>到手价</div><div>¥23499</div></div><div class="to-hand-price-detail"><div class="item"><div class="val">¥24099.00</div><div class="desc1">易购价</div></div><div class="item"><div class="val">¥600</div><div class="desc1">优惠券</div></div></div></section>');
 assert.equal(o.offer.value,24099);
 const noOrdinary=await read('<div class="red-price"><span class="final-price">到手价¥5999</span></div><p class="red-price">¥4000</p>');assert.equal(noOrdinary.offer,null);
});
test('disagreeing ordinary price observations and deposit products remain unresolved',async()=>{
 const o=await read('<div class="red-price">¥6569</div><section class="price-at-hand"><div class="to-hand-price-detail"><div class="item"><div class="val">¥6599</div><div class="desc1">易购价</div></div></div></section>');assert.equal(o.offer,null);assert.equal(o.priceStatus,'conflicting-price');
 const deposit=parseMerchantDetail({url:'https://m.suning.com/product/000/123456.html',productTitle:'测试设备定金',priceObservations:[{label:'主标价',raw:'¥100'}],text:'¥100'});assert.equal(deposit.offer,null);
});
