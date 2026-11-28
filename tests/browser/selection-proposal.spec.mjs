import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {focusedService} from '../helpers/focused-service.mjs';

test('home states the selection task and deliverable while retaining general scenarios and canvas entry',async({page})=>{
  await page.goto('/');await expect(page.locator('.intro')).toContainText('方案选型');
  await expect(page.locator('.intro')).toContainText('决策建议书');
  await expect(page.locator('.selection-deliverable')).toContainText('备选方案');
  await page.getByRole('button',{name:'工具与服务选型',exact:true}).click();await expect(page.locator('#question')).toHaveValue(/任务队列方案/);
  await page.locator('[data-home-demo]').click();await expect(page.locator('.tree-origin')).toBeVisible();
  await expect(page.locator('.u-tabs button').first()).toHaveText('What-if 画布');
});

test('a real HTTP proposal generation updates the deliverable, preserves state and exports the same checked recommendation',async({page})=>{
  const s=await focusedService();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(s.base+'/#'+s.space.id);await page.getByRole('button',{name:'查看当前建议书',exact:false}).click();
    await expect(page.locator('.proposal-status')).toContainText('规则初筛');
    const posted=page.waitForResponse(r=>r.url().endsWith('/conversation'));
    await page.getByRole('button',{name:'生成选型解读',exact:true}).click();const reply=await posted;
    expect(reply.request().postDataJSON().purpose).toBe('proposal');expect(reply.request().postDataJSON().autoResearch).toBe(false);
    await expect(page.locator('.proposal-status')).toContainText('模型建议');
    await expect(page.locator('.proposal-recommendation h3')).toHaveText('地铁旁一居');
    const saved=await s.get('/api/spaces/'+await page.evaluate(()=>location.hash.slice(1)));
    expect(saved.settings).toEqual(s.space.settings);expect(saved.candidates).toEqual(s.space.candidates);expect(saved.sources).toEqual(s.space.sources);expect(saved.scenarios).toEqual(s.space.scenarios);expect(saved.decision).toBeUndefined();expect(s.calls.search).toHaveLength(0);
    const identity=page.url();await page.locator('[data-proposal-ref]').first().click();await expect(page.locator('[data-proposal-evidence=E1]')).toHaveAttribute('open','');expect(page.url()).toBe(identity);
    await expect(page.locator('[data-proposal-evidence=E1] blockquote')).toContainText('月租');
    const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'导出决策建议书',exact:true}).click();
    const text=await readFile(await(await downloading).path(),'utf8');expect(text).toContain('地铁旁一居');expect(text).toContain('可结合租金与通勤的已知资料比较');expect(text).toContain('E1');expect(text).toContain('尚未记录最终选择');
    await page.reload();await expect(page.locator('.proposal-status')).toContainText('模型建议');expect(errors).toEqual([]);
  }finally{await page.goto('about:blank');await s.close();}
});

test('a report hypothesis creates a visible canvas branch; live recalculation updates its outcome summary and the report',async({page,request})=>{
  const space=await(await request.post('/api/spaces/demo/housing')).json();await page.goto('/#'+space.id);
  await page.getByRole('button',{name:'查看当前建议书',exact:false}).click();
  await page.locator('.proposal-hypotheses [data-guidance-suggestion]').first().click();await expect(page.locator('.flow-viewport')).toBeVisible();
  await expect(page.locator('.canvas-outcome')).toContainText('2 → 3');
  await page.locator('[data-live-input=price]').fill('3000');await page.locator('[data-live-input=price]').dispatchEvent('change');
  await expect(page.locator('.canvas-outcome')).toContainText('0');
  await page.getByRole('button',{name:'查看当前建议书',exact:false}).click();await expect(page.locator('.proposal-status')).toContainText('没有匹配方案');
  await expect(page.locator('.proposal-recommendation')).toHaveCount(0);await expect(page.locator('[data-generate-proposal]')).toBeDisabled();
});

test('recommendation becomes a human choice only after the user records it, and a new branch requires review again',async({page,request})=>{
  const space=await(await request.post('/api/spaces/demo/housing')).json();await page.goto('/#'+space.id);await page.getByRole('button',{name:'查看当前建议书',exact:false}).click();
  await page.locator('[data-proposal-select]').first().click();await expect(page.locator('#u-record')).toBeVisible();
  const before=await(await request.get('/api/spaces/'+space.id)).json();expect(before.decision).toBeUndefined();
  await page.locator('#u-record textarea').fill('软件测试：愿意增加租金，换取更短通勤。');await page.getByRole('button',{name:'保存这次判断',exact:true}).click();
  await page.getByRole('button',{name:'决策建议书',exact:true}).click();await expect(page.locator('.proposal-status')).toContainText('已记录当前选择');
  await expect(page.locator('.mission-recorded-choice')).toContainText('软件测试');
  await page.locator('.proposal-hypotheses [data-guidance-suggestion]').first().click();await page.getByRole('button',{name:'查看当前建议书',exact:false}).click();
  await expect(page.locator('.mission-recorded-choice')).toContainText('需要按当前情况复核');await expect(page.locator('.proposal-status')).not.toContainText('已记录当前选择');
});

test('failed generation can be retried and the proposal remains readable on a phone without exposing execution details',async({page})=>{
  const s=await focusedService();try{
    await page.setViewportSize({width:390,height:844});await page.goto(s.base+'/#'+s.space.id);await page.getByRole('button',{name:'查看当前建议书',exact:false}).click();
    await page.route('**/conversation',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'软件测试：暂时不可用'})}),{times:1});
    await page.locator('[data-generate-proposal]').click();await expect(page.locator('[data-generate-proposal]')).toBeEnabled();
    await page.locator('[data-generate-proposal]').click();await expect(page.locator('.proposal-status')).toContainText('模型建议');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await expect(page.locator('.proposal-page')).not.toContainText(/Harness|modelCalls|执行记录/);
    await page.locator('[data-proposal-locate]').first().click();await expect(page.locator('.tree-choice.is-answer-focus')).toBeVisible();
  }finally{await page.goto('about:blank');await s.close();}
});

test('a proposal evidence check runs the real bounded graph, returns a new branch, and reuses it for the final advice',async({page})=>{
  const s=await focusedService();try{
    await page.goto(s.base+'/#'+s.space.id);await page.getByRole('button',{name:'查看当前建议书',exact:false}).click();
    await expect(page.locator('.proposal-check')).toContainText('沿河一居');
    await page.locator('.proposal-check [data-investigate-decision]').click();
    await expect(page.locator('.universal-root')).toHaveAttribute('data-active-scenario',/scenario-(?!baseline)/,{timeout:15000});
    await expect(page.locator('.proposal-page')).toBeVisible();await expect(page.locator('.proposal-check')).toHaveCount(0);await expect(page.locator('#job-panel')).toBeHidden();
    expect(s.calls.search).toHaveLength(1);
    await page.locator('[data-generate-proposal]').click();await expect(page.locator('.proposal-status')).toContainText('模型建议');expect(s.calls.search).toHaveLength(1);
    const original=await s.get('/api/spaces/'+s.space.id),latest=await s.get('/api/spaces/'+await page.evaluate(()=>location.hash.slice(1)));
    expect(original.candidates[0].facts.commute.value).toBe(null);expect(latest.scenarios[0].candidateIds).toEqual(original.scenarios[0].candidateIds);
    expect(latest.activeScenarioId).not.toBe('scenario-baseline');
  }finally{await page.goto('about:blank');await s.close();}
});
