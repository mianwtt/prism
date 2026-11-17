import {test,expect} from '@playwright/test';
import {completeFixture} from './complete-space.fixture.mjs';
import {specificationSnapshot} from '../../src/catalog-discovery.mjs';
import {normalizeMerchantProduct} from '../../src/product-data.mjs';

test('collapsed public specification rows remain available to extraction, including RAM, disk and weight',async({page})=>{
 await page.setContent('<title>FixtureBook 16GB 512GB</title><table><tr><td>详细参数</td></tr><tr><td>CPU型号：Core 5 210H</td><td>操作系统：Windows 11</td></tr><tr style="display:none"><td>内存容量：16GB</td><td>硬盘容量：512GB</td><td>净重：1.64千克</td><td>屏幕分辨率：1920×1200</td></tr></table>');
 expect(await page.locator('body').innerText()).not.toContain('内存容量');
 const snapshot=await page.evaluate(specificationSnapshot);
 const product=normalizeMerchantProduct({key:'hidden-row-fixture',url:'https://m.suning.com/product/000/123.html',specificationTitle:snapshot.title,specificationText:snapshot.text,offer:{status:'observed',value:5999,quote:'¥5999.00',configuration:'FixtureBook 16GB 512GB',snapshot:{text:'Synthetic software fixture ¥5999.00'}}});
 expect(product.status).toBe('comparison-ready');expect(product.fields.weightKg.value).toBe(1.64);
});
test('more than two valid choices are visible and can be inspected without changing the original choice',async({page,request})=>{
 const created=await(await request.post('/api/spaces/demo')).json();
 const space={...created,...completeFixture()},third=structuredClone(space.candidates[0]);
 third.id='extra-choice';third.name='Third choice test fixture';third.facts.price={value:4800,status:'confirmed',sourceId:null,quote:''};
 space.candidates.push(third);
 await page.route('**/api/spaces/'+space.id,r=>r.fulfill({json:space}));
 await page.goto('/classic#'+space.id);
 await expect(page.locator('.choice-option')).toHaveCount(3);
 await expect(page.locator('.choice-options')).toBeVisible();
 const original=await page.locator('.choice-origin strong').textContent();
 await page.locator('[data-focus-candidate="extra-choice"]').click();
 await expect(page.locator('.choice-destination strong')).toHaveText(third.name);
 await expect(page.locator('.choice-origin strong')).toHaveText(original);
 await expect(page.locator('.choice-destination .journey-label')).toHaveText('你正在查看');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
