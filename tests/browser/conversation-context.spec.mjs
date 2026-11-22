import {test,expect} from '@playwright/test';
import {completeFixture} from './complete-space.fixture.mjs';

for(const width of [1440,390])test('contextual conversation changes, clears and undoes with saved receipts and real canvas updates at width '+width,async({page,request})=>{
 await page.setViewportSize({width,height:1000});
 const original=await(await request.post('/api/spaces/import',{data:completeFixture()})).json();
 const errors=[];let researches=0;page.on('pageerror',error=>errors.push(error.message));
 page.on('request',r=>{if(r.method()==='POST'&&/\/(?:adapt|explore|research)$/.test(new URL(r.url()).pathname))researches++;});
 await page.route('https://example.com/fixture-product-*.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="150"><rect width="240" height="150" fill="#dae8d4"/></svg>'}));
 await page.goto('/#'+original.id);
 await expect(page.locator('.universal-root')).toBeVisible();
 if(!await page.locator('#board-scenario').isVisible())await page.getByRole('button',{name:'调整条件',exact:true}).click();
 await page.locator('#board-scenario').selectOption('scenario-baseline');
 if(width<760)await page.getByRole('button',{name:'收起侧栏',exact:true}).click();
 const chat=page.locator('#conversation-message'),last=page.locator('.chat-message.assistant').last();
 await chat.fill('如果降低预算到5000以内呢');await chat.press('Enter');
 await expect(last).toContainText('2 个 → 1 个可选');
 const budget=(await(await request.get('/api/spaces/'+await page.evaluate(()=>location.hash.slice(1)))).json()).activeScenarioId;
 await expect(page.locator('[data-chat-focus=price]')).toHaveAttribute('aria-pressed','true');
 await chat.fill('如果没有要求呢');await chat.press('Enter');
 await expect(last).toContainText('5,000元 → 不限');await expect(last).toContainText('1 个 → 2 个可选');
 await expect(page.locator('.tree-branch.is-active .tree-candidates>.tree-choice')).toHaveCount(2);
 await expect(page.locator('[data-chat-focus=price]')).toHaveText('预算 不限');
 await expect(page.locator('.chat-message.user [data-chat-path]')).toHaveCount(0);
 await last.getByRole('button',{name:'撤销这次修改',exact:true}).click();
 await expect(last).toContainText('已恢复到修改前');
 await expect(page.locator('[data-tree-node="'+budget+'"]')).toHaveClass(/is-active/);
 await expect(page.locator('[data-tree-node="'+budget+'"] .tree-candidates>.tree-choice')).toHaveCount(1);
 await page.reload();await chat.click();await expect(page.locator('.chat-message.user')).toHaveCount(3);
 await expect(page.locator('.chat-choice-receipt')).toContainText(['已撤销']);
 await chat.fill('为什么有些方案不符合条件');await chat.press('Enter');await expect(last).toContainText('5,000');
 await expect(last.locator('[data-chat-path],[data-chat-undo]')).toHaveCount(0);
 const saved=await(await request.get('/api/spaces/'+await page.evaluate(()=>location.hash.slice(1)))).json();
 expect(saved.settings.limits.price).toBe(5000);expect(saved.baselineSettings.limits.price).toBe(7000);expect(saved.candidates).toEqual(original.candidates);expect(saved.sources).toEqual(original.sources);
 await page.getByRole('button',{name:'收起对话记录'}).click();
 await page.locator('[data-tree-node="'+budget+'"] .tree-choice').first().click();await expect(page.getByRole('dialog',{name:'方案详情'})).toBeVisible();await page.keyboard.press('Escape');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(researches).toBe(0);expect(errors).toEqual([]);
});

test('an ambiguous question survives refresh; a button answer leaves a receipt and only removes the chosen housing condition',async({page,request})=>{
 const space=await(await request.post('/api/spaces/demo/housing')).json();await page.goto('/#'+space.id);
 const chat=page.locator('#conversation-message');await chat.fill('如果没有要求呢');await chat.press('Enter');
 await expect(page.locator('.chat-choices')).toBeVisible();await expect(page.locator('[data-tree-node]')).toHaveCount(1);
 await page.setViewportSize({width:390,height:900});
 await expect(page.getByRole('button',{name:'只取消月租限制',exact:true})).toBeInViewport();
 await page.reload();await chat.click();
 await page.getByRole('button',{name:'只取消月租限制',exact:true}).click();
 await expect(page.locator('.chat-message.assistant').last()).toContainText('4,000元/月 → 不限');
 await expect(page.locator('.chat-choices')).toHaveCount(0);await expect(page.locator('.chat-choice-receipt')).toContainText(['已选择：只取消月租限制']);
 const next=await(await request.get('/api/spaces/'+await page.evaluate(()=>location.hash.slice(1)))).json();
 expect(next.settings.limits).toEqual({price:null,area:30,commute:45});expect(next.conversationState.pending).toBeUndefined();
});

test('condition chips support scoped short replies and direct removal while preserving other fields',async({page,request})=>{
 const space=await(await request.post('/api/spaces/import',{data:completeFixture()})).json();await page.goto('/#'+space.id);
 await page.locator('#board-scenario').selectOption('scenario-baseline');
 await page.locator('[data-chat-focus=memory]').click();const chat=page.locator('#conversation-message');await chat.fill('32G呢');await chat.press('Enter');
 await expect(page.locator('.chat-message.assistant').last()).toContainText('16GB → 32GB');
 await page.getByRole('button',{name:'取消内存限制',exact:true}).click();
 await expect(page.locator('.chat-message.assistant').last()).toContainText('32GB → 不限');
 const next=await(await request.get('/api/spaces/'+await page.evaluate(()=>location.hash.slice(1)))).json();
 expect(next.settings.limits.memory).toBe(null);expect(next.settings.limits.price).toBe(7000);expect(next.settings.limits.weight).toBe(2);
});
