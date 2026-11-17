import {test,expect} from '@playwright/test';
import {completeFixture} from './complete-space.fixture.mjs';
import {mergeScenarioResearch} from '../../src/scenario-research.mjs';

test('scenario exploration shows real job events in place, adds a branch-only candidate and keeps baseline intact',async({page,request})=>{
  const created=await(await request.post('/api/spaces/demo')).json();
  let space={...created,...completeFixture()};
  let job,finished,polls=0,posted;
  await page.route('**/api/health',r=>r.fulfill({json:{ok:true,live:true,agent:{framework:'LangGraph',graphVersion:3,checkpointStorage:'sqlite'},capabilities:{scenarioResearch:true}}}));
  await page.route('**/api/spaces/'+space.id,r=>r.fulfill({json:space}));
  await page.route('**/api/spaces/*/versions',async r=>{
    if(r.request().method()==='POST'){
      const data=r.request().postDataJSON();space={...space,...data,baselineSettings:space.settings,baselineCandidateIds:space.candidates.map(c=>c.id)};
      return r.fulfill({json:space});
    }
    return r.fulfill({json:[space]});
  });
  await page.route('**/api/spaces/*/explore',async r=>{
    posted=r.request().postDataJSON();
    job={id:'11111111-1111-1111-1111-111111111111',type:'scenario',parentId:space.id,...posted,status:'running',events:[{type:'search',message:'TEST FIXTURE: 搜索 7000–8000 元的新配置'}]};
    const incoming=completeFixture();incoming.candidates=incoming.candidates.slice(0,1);
    incoming.candidates[0].productData.sourceProductUrl='https://m.suning.com/product/000/999.html';
    incoming.candidates[0].name='测试新发现配置';incoming.candidates[0].id='new-candidate';
    finished={...mergeScenarioResearch(space,incoming,job),id:'22222222-2222-2222-2222-222222222222'};
    return r.fulfill({status:202,json:job});
  });
  await page.route('**/api/jobs/*',r=>r.fulfill({json:++polls<3?job:{...job,status:'complete',spaceId:finished.id}}));
  await page.route('**/api/spaces/22222222-2222-2222-2222-222222222222',r=>r.fulfill({json:finished}));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/classic#'+space.id);
  await page.getByRole('button',{name:'＋ 预算增加 1000 元',exact:true}).click();
  await expect(page.locator('.agent-working')).toBeVisible();
  await page.locator('.exploration-log > summary').click();
  await expect(page.locator('.exploration-log')).toContainText('TEST FIXTURE');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('.product-canonical')).toHaveCount(3);
  await expect(page.locator('.product-change').filter({hasText:'本分支新发现'})).toHaveCount(1);
  await expect(page.locator('.exploration-state')).toHaveText('本轮研究完成');
  expect(posted.scenarios.find(s=>s.id===posted.scenarioId).settings.budget).toBe(8000);
  await page.locator('.scenario-switches [data-select-scenario="scenario-baseline"]').click();
  await expect(page.locator('.product-canonical')).toHaveCount(2);
  await expect(page.locator('.canvas-products')).not.toContainText('测试新发现配置');
  await page.locator('.scenario-switches [data-select-scenario="'+posted.scenarioId+'"]').click();
  await expect(page.locator('.product-canonical')).toHaveCount(3);
  await page.getByRole('button',{name:'编辑当前情景条件',exact:true}).click();
  await page.locator('#budget').fill('8500');await page.locator('#budget').dispatchEvent('input');
  await expect(page.locator('.exploration-state')).toContainText('条件已变');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});
