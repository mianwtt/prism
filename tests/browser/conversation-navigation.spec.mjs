import {test,expect} from '@playwright/test';
import {inheritanceFixture} from './inheritance-space.fixture.mjs';

for(const width of [1440,390])test('conversation path navigation reveals and focuses the selected path without changing evidence or zoom at width '+width,async({page,request})=>{
 await page.setViewportSize({width,height:1000});
 const space=inheritanceFixture();let parent='expanded';
 for(let i=0;i<6;i++){
  const branch={...structuredClone(space.scenarios[0]),id:'history-'+i,parentScenarioId:parent,name:'历史路径 '+i};
  space.scenarios.push(branch);parent=branch.id;
 }
 space.canvasScenarioIds=['scenario-baseline','expanded'];space.activeScenarioId='expanded';
 space.conversation=[{id:'baseline-message',role:'user',content:'先保留原始情况。',scenarioId:'scenario-baseline',at:'2026-11-20T00:00:00Z'},{id:'historical-message',role:'assistant',content:'这段回答对应最后一条历史路径。',scenarioId:parent,at:'2026-11-20T00:00:00Z'}];
 const created=await(await request.post('/api/spaces/import',{data:space})).json();let writes=0;
 page.on('request',r=>{if(r.method()==='POST')writes++;});
 await page.goto('/#'+created.id);const root=page.locator('.universal-root'),view=page.locator('.flow-viewport'),thread=page.locator('.canvas-thread');
 await expect(root).toHaveAttribute('data-flow-zoom',/\d/);
 const zoom=await root.getAttribute('data-flow-zoom');await expect(page.locator('[data-flow-row="'+parent+'"]')).toHaveCount(0);
 await page.locator('#conversation-message').click();await thread.locator('.chat-message.assistant').getByRole('button',{name:'查看这条路径 ↗',exact:true}).click();
 await expect(thread).toBeHidden();await expect(page.locator('[data-tree-node="'+parent+'"]')).toHaveClass(/is-active/);
 await expect(page.locator('.flow-row')).toHaveCount(7);await expect(page.locator('#board-scenario')).toHaveValue(parent);
 await expect.poll(()=>view.evaluate(el=>el.scrollLeft)).toBeGreaterThan(100);
 const target=await page.locator('[data-flow-row="'+parent+'"]').boundingBox(),canvas=await view.boundingBox();
 expect(target.x).toBeLessThan(canvas.x+canvas.width);expect(target.x+target.width).toBeGreaterThan(canvas.x);
 await expect(page.locator('[data-flow-condition="'+parent+'"] [data-tree-condition]')).toBeFocused();
 await expect(page.locator('[data-flow-row="'+parent+'"]')).toHaveClass(/is-path-focused/);
 expect(await root.getAttribute('data-flow-zoom')).toBe(zoom);
 if(!await page.locator('.path-actions').isVisible())await page.getByRole('button',{name:'调整条件',exact:true}).click();
 await page.locator('[data-chat-from="'+parent+'"]').click();await expect(thread).toBeVisible();await expect(page.locator('#conversation-message')).toBeFocused();
 await thread.locator('.chat-message.assistant').getByRole('button',{name:'查看这条路径 ↗',exact:true}).click();await expect(thread).toBeHidden();
 await page.locator('#conversation-message').click();await thread.locator('.chat-message.user').getByRole('button',{name:'查看这条路径 ↗',exact:true}).click();
 await expect(thread).toBeHidden();await expect(page.locator('.tree-origin')).toHaveClass(/is-active/);await expect(page.locator('.tree-origin .tree-scenario')).toBeFocused();
 await expect.poll(()=>view.evaluate(el=>el.scrollLeft)).toBeLessThan(20);expect(await root.getAttribute('data-flow-zoom')).toBe(zoom);
 const unchanged=await(await request.get('/api/spaces/'+created.id)).json();expect(unchanged.candidates).toEqual(created.candidates);expect(unchanged.scenarios).toEqual(created.scenarios);expect(writes).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
