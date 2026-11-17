import {test,expect} from '@playwright/test';
import {completeFixture} from './complete-space.fixture.mjs';

test('arbitrary branch comparison explains exact exits and saved quotes without changing branches or running research',async({page,request})=>{
 const stored=await(await request.post('/api/spaces/demo')).json(),data={...stored,...completeFixture()};
 data.canvasScenarioIds=data.scenarios.map(s=>s.id);data.activeScenarioId='scenario-budget';
 await page.route('**/api/spaces/'+data.id,r=>r.fulfill({json:data}));
 await page.route('https://example.com/fixture-product-*.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect width="100" height="80" fill="#dde8d4"/></svg>'}));
 const writes=[];page.on('request',r=>{if(r.method()==='POST')writes.push(r.url());});
 await page.goto('/#'+data.id);const root=page.locator('.universal-root');await expect(root).toHaveAttribute('data-flow-zoom',/\d/);
 const zoom=await root.getAttribute('data-flow-zoom'),count=await page.locator('.flow-row').count();
 await page.getByRole('button',{name:'对比分支',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'分支对比'});await expect(dialog).toBeVisible();
 await expect(dialog.locator('.compare-summary')).toContainText('2 → 1');
 await expect(dialog.locator('.compare-record')).toHaveCount(1);
 await expect(dialog.locator('.compare-record')).toContainText('5,199元');await expect(dialog.locator('.compare-record')).toContainText('5,000元');
 await dialog.locator('.compare-proof>summary').click();await expect(dialog.locator('.compare-proof blockquote')).toContainText('5199');
 await expect(dialog.locator('.compare-proof .compare-citation a')).toHaveAttribute('href',/suning/);
 await dialog.getByLabel('左侧分支',{exact:true}).selectOption('scenario-commute');
 await expect(dialog.locator('.compare-summary')).toContainText('1 个进入，1 个退出');
 await expect(dialog.locator('.compare-record')).toHaveCount(2);
 await dialog.getByRole('button',{name:'交换对比分支'}).click();await expect(dialog.getByLabel('右侧分支',{exact:true})).toHaveValue('scenario-commute');
 expect(writes).toEqual([]);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 expect(await root.getAttribute('data-flow-zoom')).toBe(zoom);expect(await page.locator('.flow-row').count()).toBe(count);
 await page.getByRole('button',{name:'对比分支',exact:true}).click();await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await page.getByRole('button',{name:'继续找更多可能 ↗',exact:true}).click();
 await expect(page.locator('#conversation-message')).toHaveValue(/继续查找更多/);await expect(page.locator('.canvas-thread')).toBeVisible();
 expect(writes).toEqual([]);
});

test('focusing the sole composer reveals persisted complete chat; reimport keeps the conversation and source records',async({page,request})=>{
 const data=await(await request.post('/api/spaces/demo/housing')).json();await page.goto('/#'+data.id);
 const input=page.locator('#conversation-message'),thread=page.locator('.canvas-thread');
 await expect(thread).toBeHidden();await expect(page.locator('.canvas-inspector .conversation-panel')).toHaveCount(0);
 await input.click();await expect(thread).toBeVisible();await expect(thread.locator('.initial-request')).toContainText(data.question);
 await input.fill('如果月租改为5000元呢？');await input.press('Enter');await expect(thread.locator('.chat-message.user')).toHaveCount(1);
 await input.fill('为什么有些方案不符合条件？');await input.press('Enter');await expect(thread.locator('.chat-message.user')).toHaveCount(2);
 await page.reload();await expect(thread).toBeHidden();await input.click();await expect(thread.locator('.chat-message.user')).toHaveCount(2);
 await expect(thread.locator('.chat-message.assistant')).toHaveCount(2);
 const id=await page.evaluate(()=>location.hash.slice(1)),snapshot=await(await request.get('/api/spaces/'+id+'/export')).json();
 expect(snapshot.conversation).toHaveLength(4);expect(snapshot.sources).toEqual(data.sources);
 const imported=await(await request.post('/api/spaces/import',{data:snapshot})).json();expect(imported.conversation).toHaveLength(4);
 await page.goto('/#'+imported.id);await input.click();await expect(thread.locator('.chat-message.user')).toHaveCount(2);
 await page.getByRole('button',{name:'收起对话记录'}).click();await expect(thread).toBeHidden();
 await input.click();await expect(thread).toBeVisible();await page.locator('.flow-viewport').click({position:{x:10,y:10}});await expect(thread).toBeHidden();
 await page.setViewportSize({width:390,height:844});await input.click();await expect(thread).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
