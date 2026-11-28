import {test,expect} from '@playwright/test';
import {completeFixture} from './complete-space.fixture.mjs';

test('canvas owns the workspace, evidence cards stay readable and ordinary clicks never alter zoom',async({page,request})=>{
 const stored=await(await request.post('/api/spaces/demo')).json(),data={...stored,...completeFixture()};data.canvasScenarioIds=data.scenarios.map(s=>s.id);data.activeScenarioId='scenario-commute';
 await page.route('**/api/spaces/'+data.id,r=>r.fulfill({json:data}));
 await page.route('https://example.com/fixture-product-*.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect width="100" height="80" fill="#dde8d4"/></svg>'}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/#'+data.id);
 const studio=page.locator('.compact-studio'),view=page.locator('.flow-viewport'),root=page.locator('.universal-root');
 await expect(root).toHaveAttribute('data-flow-zoom','1');
 const stage=await studio.boundingBox(),canvas=await view.boundingBox();
 const outcome=await page.locator('.canvas-outcome').boundingBox();expect(canvas.width/stage.width).toBeGreaterThan(.7);expect((canvas.height+outcome.height)/stage.height).toBeGreaterThan(.7);
 await expect(view.locator('input,textarea,select,form')).toHaveCount(0);
 await expect(studio.locator('.canvas-prompt #conversation-message')).toBeVisible();
 await expect(studio.locator('#u-conversation button[type=submit]')).toHaveCount(1);
 await expect(studio.locator('.prompt-context [data-chat-focus]')).toHaveCount(data.schema?.fields.length||4);
 const face=await view.locator('.node-face').first().boundingBox();expect(face.width).toBeLessThanOrEqual(88);expect(face.height).toBeLessThanOrEqual(88);
 expect(await view.locator('.tree-node').first().evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('1px');await expect(view.locator('.tree-choice-facts').first()).toContainText('预算');
 await page.locator('[data-flow-condition="scenario-commute"] [data-tree-condition]').click();await expect(root).toHaveAttribute('data-flow-zoom','1');
 await page.locator('.canvas-inspector [data-live-condition=price][data-live-value="5000"]').click();await expect(root).toHaveAttribute('data-flow-zoom','1');
 await page.locator('.tree-origin .tree-choice').first().click();await expect(page.locator('.option-dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(root).toHaveAttribute('data-flow-zoom','1');
 await page.locator('.prompt-history').click();await expect(page.locator('#conversation-message')).toBeVisible();await expect(root).toHaveAttribute('data-flow-zoom','1');
 await page.locator('.flow-tools [data-toggle-inspector]').click();const expanded=await view.boundingBox();expect(expanded.width).toBeGreaterThan(canvas.width+200);await expect(root).toHaveAttribute('data-flow-zoom','1');
 await page.getByRole('button',{name:'放大画布',exact:true}).click();await expect(root).toHaveAttribute('data-flow-zoom','1.1');
 await page.locator('.flow-tools [data-toggle-inspector]').click();await expect(root).toHaveAttribute('data-flow-zoom','1.1');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 expect(errors).toEqual([]);
});

test('nested branches share a tree layout instead of accumulating vertical rows',async({page,request})=>{
 const data=await(await request.post('/api/spaces/demo/housing')).json();
 const make=(id,parent,name,limits)=>({id,parentScenarioId:parent,name,settings:{...data.settings,limits:{...data.settings.limits,...limits}}});
 const a=make('budget','scenario-baseline','更省一点',{price:3500}),b=make('space','scenario-baseline','更宽敞一点',{price:5000,area:50}),c=make('budget-close','budget','省预算并缩短通勤',{price:3500,commute:40}),d=make('space-close','space','大空间并缩短通勤',{price:5000,area:50,commute:20});
 const scenarios=[...data.scenarios,a,b,c,d];
 const saved=await(await request.post('/api/spaces/'+data.id+'/versions',{data:{adaptive:true,scenarios,activeScenarioId:'budget',canvasScenarioIds:scenarios.map(s=>s.id)}})).json();
 await page.setViewportSize({width:2000,height:1100});await page.goto('/#'+saved.id);await expect(page.locator('.flow-row')).toHaveCount(4);
 const box=async id=>page.locator('[data-flow-row="'+id+'"]').boundingBox();
 const aa=await box('budget'),bb=await box('space'),cc=await box('budget-close'),dd=await box('space-close');
 expect(Math.abs(aa.x-bb.x)).toBeLessThan(1);expect(Math.abs(cc.x-dd.x)).toBeLessThan(1);
 expect(cc.x).toBeGreaterThan(aa.x+aa.width);expect(dd.x).toBeGreaterThan(bb.x+bb.width);
 expect(Math.abs(aa.y+aa.height/2-cc.y-cc.height/2)).toBeLessThan(1);
 expect(Math.abs(bb.y+bb.height/2-dd.y-dd.height/2)).toBeLessThan(1);
 expect(aa.y+aa.height).toBeLessThan(bb.y);
 await expect(page.locator('.tree-origin .board-limits')).toContainText('4,000');
 expect(await page.locator('.flow-edges g path').evaluateAll(paths=>paths.every(p=>!p.getAttribute('d').includes('NaN')))).toBe(true);
});

test('long trees keep readable nodes and can be panned on a phone without widening the page',async({page,request})=>{
 const stored=await(await request.post('/api/spaces/demo')).json(),data={...stored,...completeFixture()};
 const baseline=data.scenarios[0];
 data.scenarios=[baseline,...Array.from({length:6},(_,i)=>({...structuredClone(baseline),id:'long-'+i,parentScenarioId:i?'long-'+(i-1):baseline.id,name:'路径 '+(i+1)}))];
 data.canvasScenarioIds=data.scenarios.map(s=>s.id);data.activeScenarioId='long-5';
 await page.route('**/api/spaces/'+data.id,r=>r.fulfill({json:data}));
 await page.route('https://example.com/fixture-product-*.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect width="100" height="80" fill="#dde8d4"/></svg>'}));
 await page.goto('/#'+data.id);await expect(page.locator('.tree-branch')).toHaveCount(6);
 expect(Number(await page.locator('.universal-root').getAttribute('data-flow-zoom'))).toBeGreaterThanOrEqual(.65);
 await page.setViewportSize({width:390,height:844});await page.reload();await expect(page.locator('.tree-branch')).toHaveCount(6);
 expect(Number(await page.locator('.universal-root').getAttribute('data-flow-zoom'))).toBeGreaterThanOrEqual(.8);
 const view=page.locator('.flow-viewport');expect(await view.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
 const face=await page.locator('.tree-origin .node-face').first().boundingBox();expect(face.width).toBeGreaterThanOrEqual(60);
 const canvas=await view.boundingBox();await page.mouse.move(canvas.x+canvas.width-30,canvas.y+80);await page.mouse.down();await page.mouse.move(canvas.x+30,canvas.y+80,{steps:6});await page.mouse.up();
 expect(await view.evaluate(el=>el.scrollLeft)).toBeGreaterThan(100);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await page.getByRole('button',{name:'调整条件',exact:true}).click();await expect(page.locator('.canvas-inspector')).toBeVisible();
});
