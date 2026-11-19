import {test,expect} from '@playwright/test';
import {completeFixture} from './complete-space.fixture.mjs';
async function openFixture(page,request){
  const stored=await(await request.post('/api/spaces/demo')).json(),space={...stored,...completeFixture()};
  space.activeScenarioId='scenario-commute';space.canvasScenarioIds=space.scenarios.map(s=>s.id);space.scenarios.find(s=>s.id==='scenario-commute').settings.maxWeight=2;
  await page.route('**/api/spaces/'+space.id,r=>r.fulfill({json:space}));
  await page.goto('/#'+space.id);return space;
}
test('one condition click immediately changes only its branch and explains the exits; undo restores it',async({page,request})=>{
  await openFixture(page,request);
  const branch=page.locator('[data-tree-node="scenario-commute"]'),choices=branch.locator(':scope > .tree-candidates > .tree-choice');
  await expect(choices).toHaveCount(2);
  const original=await page.locator('.tree-origin > .tree-candidates').textContent(),sibling=await page.locator('[data-tree-node="scenario-budget"] > .tree-candidates').textContent();
  await page.locator('.tree-origin').evaluate(el=>el.dataset.identity='same-origin-node');
  let researchCalls=0;page.on('request',r=>{if(r.method()==='POST'&&/research|explore|adapt/.test(r.url()))researchCalls++;});
  await page.locator('.board-controlbar [data-live-condition=price][data-live-value="5000"]').click();
  await expect(choices).toHaveCount(1);
  await expect(page.locator('.inspector-impact .live-impact')).toContainText('2 → 1 个可选');
  await expect(page.locator('.inspector-impact .live-impact')).toContainText('1 个退出');
  await expect(page.locator('.inspector-references .live-exits')).toContainText('价格超过上限');
  expect(await page.locator('.tree-origin > .tree-candidates').textContent()).toBe(original);
  await expect(page.locator('.tree-origin')).toHaveAttribute('data-identity','same-origin-node');
  expect(await page.locator('[data-tree-node="scenario-budget"] > .tree-candidates').textContent()).toBe(sibling);
  await page.locator('.inspector-impact').getByRole('button',{name:'撤销',exact:true}).click();await expect(choices).toHaveCount(2);
  expect(researchCalls).toBe(0);
});
test('clicking a branch exposes its conditions; entering a new threshold immediately recomputes every matching image',async({page,request})=>{
  await openFixture(page,request);const branch=page.locator('[data-tree-node="scenario-commute"]');
  const condition=page.locator('[data-flow-condition="scenario-commute"]');await condition.locator('[data-tree-condition]').click();
  await expect(page.locator('.canvas-inspector [data-live-input=memory]')).toBeVisible();
  await page.locator('[data-live-input=memory]').fill('32');await page.locator('[data-live-input=memory]').dispatchEvent('change');
  await expect(branch.locator(':scope > .tree-candidates > .tree-choice')).toHaveCount(0);
  await expect(page.locator('.inspector-impact .live-impact')).toContainText('2 个退出');
  await expect(page.locator('.inspector-references .live-exits')).toContainText('内存低于下限');
  await expect(page.locator('.tree-origin > .tree-candidates > .tree-choice')).toHaveCount(2);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
test('slider input updates results during the gesture without replacing the slider, and baseline edits create a separate branch',async({page,request})=>{
  await openFixture(page,request);const branch=page.locator('[data-tree-node="scenario-commute"]');
  const slider=page.locator('[data-live-range=price]');
  const preserved=await slider.evaluate(el=>{el.dataset.marker='same-slider';return el.dataset.marker;});
  await slider.evaluate(el=>{el.value='5000';el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));el.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect(branch.locator(':scope > .tree-candidates > .tree-choice')).toHaveCount(1);
  await expect(slider).toHaveAttribute('data-marker',preserved);
  await slider.evaluate(el=>{el.value='6000';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect(branch.locator(':scope > .tree-candidates > .tree-choice')).toHaveCount(2);
  await slider.dispatchEvent('change');
  await page.locator('#board-scenario').selectOption('scenario-baseline');
  const count=await page.locator('.tree-branch').count();
  await page.locator('.board-controlbar [data-live-condition=price][data-live-value="5000"]').click();
  await expect(page.locator('.tree-branch')).toHaveCount(count+1);
  await expect(page.locator('.tree-origin > .tree-candidates > .tree-choice')).toHaveCount(2);
  await expect(page.locator('.tree-origin .board-limits')).toContainText('7,000');
});
