import {test,expect} from '@playwright/test';
import {inheritanceFixture} from './inheritance-space.fixture.mjs';

test('condition suggestions use observed values and saved hypotheses; arbitrary numeric input remains available',async({page,request})=>{
 const space=inheritanceFixture();
 const unknown=structuredClone(space.candidates[0]);unknown.id='unknown';unknown.facts.memory={value:999,status:'unknown',sourceId:null,quote:''};space.candidates.push(unknown);
 const created=await(await request.post('/api/spaces/import',{data:space})).json();
 await page.goto('/#'+created.id);await page.locator('[data-flow-condition=expanded] [data-tree-condition]').click();
 const values=await page.locator('.canvas-inspector [data-live-condition=memory]').evaluateAll(buttons=>buttons.map(b=>Number(b.dataset.liveValue)));
 expect(values).toEqual([16,24]);
 await page.locator('[data-live-input=memory]').fill('32');await page.locator('[data-live-input=memory]').dispatchEvent('change');
 await expect(page.locator('[data-tree-node=expanded] .tree-choice')).toHaveCount(0);
 await expect(page.locator('.tree-origin .tree-choice')).toHaveCount(2);
 await expect(page.locator('.canvas-inspector [data-live-condition=memory][data-live-value="32"]')).toHaveAttribute('aria-pressed','true');
});
