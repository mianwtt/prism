import {test,expect} from '@playwright/test';
import {completeFixture} from './complete-space.fixture.mjs';

for(const destination of ['baseline','another-space','home'])test('a delayed real conversation response respects later navigation to '+destination,async({page,request})=>{
 const original=await(await request.post('/api/spaces/import',{data:completeFixture()})).json();
 const other=await(await request.post('/api/spaces/demo/housing')).json();
 await page.goto('/#'+original.id);await page.locator('#board-scenario').selectOption('scenario-budget');
 let ready,release,delivered;const prepared=new Promise(resolve=>ready=resolve),gate=new Promise(resolve=>release=resolve),done=new Promise(resolve=>delivered=resolve);
 // Only delay delivery; the response is generated and saved by the real HTTP
 // route and deterministic evaluator, rather than a fabricated response body.
 await page.route('**/api/spaces/*/conversation',async route=>{
   const response=await route.fetch();ready();await gate;await route.fulfill({response});delivered();
 });
 await page.locator('#conversation-message').fill('为什么有些方案不符合条件');await page.locator('#conversation-message').press('Enter');await prepared;
 await expect(page.locator('[data-live-input=price]')).toBeDisabled();
 await page.getByRole('button',{name:'收起对话记录',exact:true}).click();
 if(destination==='baseline')await page.locator('#board-scenario').selectOption('scenario-baseline');
 else if(destination==='another-space')await page.locator('#spaces [data-space="'+other.id+'"]').click();
 else await page.locator('#new-space').click();
 release();await done;
 if(destination==='baseline'){
  await expect(page.locator('.universal-root')).not.toHaveAttribute('data-display-space',original.id);
  await expect(page.locator('#board-scenario')).toHaveValue('scenario-baseline');await expect(page.locator('[data-live-input=price]')).toHaveValue('7000');await expect(page.locator('[data-live-input=price]')).toBeEnabled();
  await page.locator('#conversation-message').click();await expect(page.locator('.chat-message.assistant').last().locator('.chat-scope')).toContainText('5,000');
 }else{
  await expect(page.locator('#toast')).toContainText('对话已保存到原来的决策空间');
  if(destination==='another-space'){await expect(page.locator('.universal-root')).toHaveAttribute('data-display-space',other.id);await expect(page.locator('.u-heading h1')).toHaveText(other.title);}
  else await expect(page.locator('#welcome')).toBeVisible();
 }
});
