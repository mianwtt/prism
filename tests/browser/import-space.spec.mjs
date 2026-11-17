import {test,expect} from '@playwright/test';
import {housingDemo} from '../../src/general-space.mjs';

test('a downloaded decision can be imported, inspected and branched without a model or changing its original',async({page,request})=>{
  const original=await(await request.post('/api/spaces/demo/housing')).json();
  const exported=await(await request.get('/api/spaces/'+original.id+'/export')).json();
  exported.candidates[1].media={url:'https://example.org/import-photo.svg'};
  exported.decision={candidateId:'housing-1',rationale:'虚构测试：更关注通勤。'};
  await page.route('https://example.org/import-photo.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="green"/></svg>'}));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.locator('#import-file').setInputFiles({name:'prism-housing.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
  await expect(page.locator('.universal-root')).toBeVisible();
  await expect(page.locator('.tree-origin')).toContainText('地铁旁一居');
  const importedId=await page.evaluate(()=>location.hash.slice(1));expect(importedId).not.toBe(original.id);
  await page.locator('.tree-origin .tree-choice').filter({hasText:'地铁旁一居'}).click();
  await expect(page.getByRole('dialog').locator('img').first()).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('3,900');
  await page.keyboard.press('Escape');
  await page.locator('[data-u-pane=memory]').click();await expect(page.locator('.recorded-choice')).toContainText('地铁旁一居');await expect(page.locator('.recorded-choice')).toContainText('更关注通勤');
  await page.locator('[data-u-pane=canvas]').click();await page.locator('.tree-origin .tree-scenario').click();
  await page.locator('.board-controlbar [data-live-input=price]').fill('5000');
  await expect(page.locator('.tree-branch')).toHaveCount(1);await expect(page.locator('.tree-origin .tree-scenario')).toHaveAttribute('title',/4,000/);
  expect((await(await request.get('/api/spaces/'+original.id)).json()).version).toBe(1);
  expect(errors).toEqual([]);
});

test('invalid files show an actionable error and leave the home usable',async({page,request})=>{
  await page.goto('/');const count=(await(await request.get('/api/spaces')).json()).length;
  await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
  await expect(page.locator('#toast')).toContainText('无法读取 JSON');await expect(page.locator('#welcome')).toBeVisible();
  const invalid=housingDemo();invalid.sources[0].url='file:///private';
  await page.locator('#import-file').setInputFiles({name:'bad-source.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
  await expect(page.locator('#toast')).toContainText('不支持的来源地址');expect((await(await request.get('/api/spaces')).json()).length).toBe(count);
});
