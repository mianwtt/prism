import {test,expect} from '@playwright/test';
import {focusedService} from '../helpers/focused-service.mjs';

test('evidence-derived suggestions create a canvas branch and preserve the original constraints without research',async({page,request})=>{
  const demo=await(await request.post('/api/spaces/demo/housing')).json();let researchCalls=0;
  page.on('request',req=>{if(/\/(investigate|adapt|research)$/.test(req.url()))researchCalls++;});
  await page.goto('/#'+demo.id);await page.getByRole('button',{name:'探索决策建议',exact:true}).click();
  const proposal=page.locator('.exploration-hypothesis').filter({has:page.locator('[data-guidance-suggestion="relax:price=4600"]')});
  await expect(proposal).toContainText('2 → 3');await proposal.locator('summary').click();await expect(proposal.locator('blockquote')).toContainText('4600');
  await proposal.locator('[data-guidance-suggestion]').click();
  await expect(page.locator('.canvas-inspector')).toContainText('调整条件');
  const active=await page.locator('.universal-root').getAttribute('data-active-scenario');
  expect(active).not.toBe('scenario-baseline');
  await expect(page.locator('[data-live-input=price]')).toHaveValue('4600');
  await expect(page.locator('.tree-origin .board-limits')).toContainText('4,000');
  const draft=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.includes('workspace')).map(([,value])=>JSON.parse(value)));
  expect(draft.some(value=>JSON.stringify(value).includes('4600'))).toBe(true);
  const count=await page.locator('[data-tree-node]').count();
  // Repeating the same proposal from the same parent selects its existing child.
  await page.locator('[data-tree-open="scenario-baseline"]').first().click();await page.getByRole('button',{name:'关闭方案详情',exact:true}).click();
  await page.getByRole('button',{name:'探索决策建议',exact:true}).click();
  await page.locator('[data-guidance-suggestion="relax:price=4600"]').click();
  expect(await page.locator('[data-tree-node]').count()).toBe(count);
  await expect(page.locator('.universal-root')).toHaveAttribute('data-active-scenario',active);
  expect(researchCalls).toBe(0);await expect(page.locator('#job-panel')).toBeHidden();
});

test('a failed research request restores the action so the user can retry without losing the canvas',async({page})=>{
  const service=await focusedService();try{
    await page.goto(service.base+'/#'+service.space.id);await page.getByRole('button',{name:'探索决策建议',exact:true}).click();
    await page.route('**/investigate',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'软件测试：连接暂不可用'})}),{times:1});
    await page.locator('[data-investigate-decision]').first().click();
    await expect(page.locator('[data-investigate-decision]').first()).toBeEnabled();
    await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#job-panel')).toBeHidden();
    await page.locator('[data-investigate-decision]').first().click();
    await expect(page.locator('.universal-root')).toHaveAttribute('data-active-scenario',/scenario-(?!baseline)/,{timeout:15000});
  }finally{await page.goto('about:blank');await service.close();}
});

test('completion of a focused research does not pull the user away from another branch',async({page})=>{
  const service=await focusedService({delay:1200,branch:true});try{
    await page.goto(service.base+'/#'+service.space.id);await page.getByRole('button',{name:'探索决策建议',exact:true}).click();
    const posted=page.waitForResponse(response=>response.url().endsWith('/investigate'));
    await page.locator('[data-investigate-decision]').first().click();await posted;
    const other=service.space.scenarios[1].id;
    await page.locator('[data-tree-condition="'+other+'"]').click();
    await expect(page.locator('.universal-root')).toHaveAttribute('data-active-scenario',other);
    await expect.poll(()=>page.evaluate(()=>location.hash.slice(1)),{timeout:15000}).not.toBe(service.space.id);
    await expect(page.locator('.universal-root')).toHaveAttribute('data-active-scenario',other);
    const after=await service.get('/api/spaces/'+await page.evaluate(()=>location.hash.slice(1)));
    expect(after.scenarios.some(s=>s.research?.focus?.status==='evidence-found')).toBe(true);
  }finally{await page.goto('about:blank');await service.close();}
});

test('focused evidence research stays on the canvas and returns an immutable comparison branch through real HTTP',async({page})=>{
  const service=await focusedService();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(service.base+'/#'+service.space.id);await page.getByRole('button',{name:'探索决策建议',exact:true}).click();
    await expect(page.locator('.exploration-question').first()).toContainText('沿河一居');
    await expect(page.locator('.exploration-question').first()).toContainText('通勤');
    await page.locator('.exploration-hypothesis details').first().locator('summary').click();
    await expect(page.locator('.exploration-hypothesis details').first().getByRole('link',{name:'打开原文 ↗'})).toHaveAttribute('href',/^https:\/\/example.org\/software-fixture\//);
    await page.getByRole('button',{name:'核对这些依据',exact:false}).first().click();
    await expect(page.locator('.universal-root')).toHaveAttribute('data-active-scenario',/scenario-(?!baseline)/,{timeout:15000});
    await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#job-panel')).toBeHidden();
    const id=await page.evaluate(()=>location.hash.slice(1)),after=await service.get('/api/spaces/'+id);
    const child=after.scenarios.find(s=>s.id===after.activeScenarioId),updated=after.candidates.find(c=>c.id===child.research.focus.updatedCandidateId);
    expect(updated.facts.commute.value).toBe(35);expect(updated.facts.price.value).toBe(3200);
    expect(after.candidates[0].facts.commute.value).toBe(null);expect(child.settings).toEqual(service.space.scenarios[0].settings);
    expect(child.research.focus.status).toBe('evidence-found');expect(errors).toEqual([]);
    await page.reload();await expect(page.locator('.universal-root')).toHaveAttribute('data-active-scenario',child.id);
  }finally{await page.goto('about:blank');await service.close();}
});

test('exploration panel works at mobile width, switches modes and keeps actions within the viewport',async({page,request})=>{
  const demo=await(await request.post('/api/spaces/demo/housing')).json();
  await page.setViewportSize({width:390,height:844});await page.goto('/#'+demo.id);
  await page.getByRole('button',{name:'探索决策建议',exact:true}).click();
  await expect(page.locator('.decision-exploration')).toBeVisible();
  const button=page.locator('[data-guidance-suggestion]').first();await button.scrollIntoViewIfNeeded();
  const box=await button.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.getByRole('button',{name:'调整条件',exact:true}).click();await expect(page.locator('[data-live-input=price]')).toBeVisible();
  await page.getByRole('button',{name:'探索建议',exact:true}).click();await expect(page.locator('.decision-exploration')).toBeVisible();
  await page.getByRole('button',{name:'收起侧栏',exact:true}).click();await expect(page.locator('.decision-exploration')).toBeHidden();
});
