import {test,expect} from '@playwright/test';
import {focusedService} from '../helpers/focused-service.mjs';

test('grounded answers expose original evidence and locate the actual candidate without changing conditions',async({page,request})=>{
  const space=await(await request.post('/api/spaces/demo/housing')).json();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/#'+space.id);await page.getByRole('button',{name:'比较取舍',exact:true}).click();
  await expect(page.locator('.decision-answer .answer-option')).toHaveCount(2);
  const first=page.locator('.answer-option').first();await first.locator('summary').click();await expect(first.locator('blockquote').first()).toContainText('月租');
  const target=await first.locator('[data-answer-candidate]').getAttribute('data-answer-candidate');
  await first.getByRole('button',{name:'在画布定位方案',exact:false}).click();
  await expect(page.locator('.canvas-thread')).toBeHidden();await expect(page.locator('.tree-choice.is-answer-focus')).toHaveAttribute('data-tree-candidate',target);
  await expect(page.locator('.universal-root')).toHaveAttribute('data-flow-zoom','1');
  const after=await(await request.get('/api/spaces/'+await page.evaluate(()=>location.hash.slice(1)))).json();
  expect(after.settings).toEqual(space.settings);expect(after.scenarios).toEqual(space.scenarios);expect(after.sources).toEqual(space.sources);
  expect(errors).toEqual([]);
});

test('actual live HTTP conversation gates an excluded model suggestion and preserves its source-backed answer on reload',async({page})=>{
  const service=await focusedService();try{
    await page.goto(service.base+'/#'+service.space.id);await page.getByRole('button',{name:'比较取舍',exact:true}).click();
    await expect(page.locator('.answer-option')).toHaveCount(1);await expect(page.locator('.answer-option-heading')).toContainText('地铁旁一居');
    await page.locator('.answer-option summary').click();await expect(page.locator('.answer-citation').first().getByRole('link')).toHaveAttribute('href',service.space.sources[1].url);
    const id=await page.evaluate(()=>location.hash.slice(1)),saved=await service.get('/api/spaces/'+id);
    expect(saved.conversation.at(-1).decisionAnswer.rejectedSuggestions).toBe(1);expect(saved.scenarios).toEqual(service.space.scenarios);
    await page.reload();await page.locator('#conversation-message').click();await expect(page.locator('.answer-option-heading')).toContainText('地铁旁一居');
    expect(service.calls.search).toHaveLength(0);
  }finally{await page.goto('about:blank');await service.close();}
});

test('a historical answer is labeled stale after its underlying source changes and cannot masquerade as current advice',async({page,request})=>{
  const demo=await(await request.post('/api/spaces/demo/housing')).json();
  const answered=await(await request.post('/api/spaces/'+demo.id+'/conversation',{data:{message:'帮我比较方案取舍',scenarioId:'scenario-baseline'}})).json();
  const imported={...answered,sources:answered.sources.map(s=>({...s,text:s.text+' 软件测试：来源版本已变化。'}))};
  const stored=await(await request.post('/api/spaces/import',{data:imported})).json();
  await page.goto('/#'+stored.id);await page.locator('#conversation-message').click();
  await expect(page.locator('.answer-stale')).toContainText('当前情况已变化');await expect(page.locator('.decision-answer')).toHaveCount(0);
  await page.locator('.answer-stale summary').click();await expect(page.locator('.answer-stale')).toContainText('地铁旁一居');
});

test('the canvas explains a branch change, supports readable focus and an explicit overview, and remains usable on mobile',async({page,request})=>{
  const demo=await(await request.post('/api/spaces/demo/housing')).json();await page.goto('/#'+demo.id);
  const input=page.locator('#conversation-message');await input.fill('如果预算降到3500元');await input.press('Enter');
  await expect(page.locator('.canvas-outcome')).toContainText('2 → 1');await expect(page.locator('.canvas-outcome')).toContainText('4,000元/月');await expect(page.locator('.canvas-outcome')).toContainText('3,500元/月');
  await page.getByRole('button',{name:'收起对话记录',exact:true}).click();
  await expect(page.locator('.tree-choice-facts').first()).toContainText('月租');
  await page.getByRole('button',{name:'适应画布',exact:true}).click();await page.getByRole('button',{name:'聚焦当前分支',exact:true}).click();await expect(page.locator('.universal-root')).toHaveAttribute('data-flow-zoom','1');
  await page.setViewportSize({width:390,height:844});await input.fill('帮我比较方案取舍');await input.press('Enter');
  await expect(page.locator('.decision-answer')).toBeVisible();await page.locator('[data-answer-candidate]').first().click();
  await expect(page.locator('.tree-choice.is-answer-focus')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
