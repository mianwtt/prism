import {test,expect} from '@playwright/test';
import {housingDemo} from '../../src/general-space.mjs';

async function fixture(request){
 const space=housingDemo();
 space.schema.fields.push({key:'region',label:'示例区域',type:'enum',options:['甲区','乙区'],direction:1});
 for(const settings of [space.settings,space.baselineSettings,...space.scenarios.map(s=>s.settings)]){settings.limits.region='甲区';settings.weights.region=0;}
 for(const c of space.candidates)c.facts.region={value:'甲区',status:'example',sourceId:space.sources[0].id,quote:'软件测试虚构区域：甲区'};
 return (await request.post('/api/spaces/import',{data:space})).json();
}
async function inspector(page){await expect(page.locator('#board-scenario')).toBeAttached();if(!await page.locator('#board-scenario').isVisible())await page.locator('.flow-tools [data-toggle-inspector]').click();}

for(const width of [1440,390])test('clearing a zero-weight hard filter keeps its controls available for restoring it at width '+width,async({page,request})=>{
 const space=await fixture(request);await page.setViewportSize({width,height:1000});await page.goto('/#'+space.id);await inspector(page);
 await page.locator('[data-live-condition=region][data-live-value="null"]').click();
 const restore=page.locator('[data-live-condition=region]').filter({hasText:'甲区'});await expect(restore).toBeVisible();await expect(page.locator('[data-live-condition=region][data-live-value="null"]')).toHaveAttribute('aria-pressed','true');
 await restore.click();await expect(restore).toHaveAttribute('aria-pressed','true');
 expect((await(await request.get('/api/spaces/'+space.id)).json()).baselineSettings.limits.region).toBe('甲区');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});

test('manual conditions, an unsent question and a decision draft survive switching spaces and refresh without rewriting saved history',async({page,request})=>{
 const space=await fixture(request),other=await(await request.post('/api/spaces/demo/housing')).json();await page.goto('/#'+space.id);await inspector(page);
 await page.locator('[data-live-input=price]').fill('3000');await page.locator('[data-live-input=price]').press('Tab');
 const path=await page.locator('#board-scenario').inputValue();await page.locator('#conversation-message').fill('还没发送的取舍问题');
 await page.locator('#spaces [data-space="'+other.id+'"]').click();await page.locator('#spaces [data-space="'+space.id+'"]').click();await inspector(page);
 await expect(page.locator('[data-live-input=price]')).toHaveValue('3000');await expect(page.locator('#board-scenario')).toHaveValue(path);await expect(page.locator('#conversation-message')).toHaveValue('还没发送的取舍问题');
 await page.reload();await expect(page.locator('#conversation-message')).toHaveValue('还没发送的取舍问题');await inspector(page);await expect(page.locator('[data-live-input=price]')).toHaveValue('3000');
 await page.getByRole('button',{name:'我的判断',exact:true}).click();await page.locator('#u-record select[name=candidateId]').selectOption(space.candidates[0].id);await page.locator('#u-record textarea').fill('尚未提交的个人判断');
 await page.reload();await expect(page.locator('#u-record textarea')).toHaveValue('尚未提交的个人判断');await expect(page.locator('#u-record select[name=candidateId]')).toHaveValue(space.candidates[0].id);
 const saved=await(await request.get('/api/spaces/'+space.id)).json();expect(saved.scenarios).toHaveLength(space.scenarios.length);expect(saved.settings.limits.price).toBe(4000);expect(saved.decision).toBeUndefined();
});

test('export includes current unsaved conditions and scoped branches, and the downloaded file reimports with its original baseline intact',async({page,request})=>{
 const space=await fixture(request);await page.goto('/#'+space.id);await inspector(page);await page.locator('[data-live-input=price]').fill('3000');await page.locator('[data-live-input=price]').press('Tab');
 await page.getByRole('button',{name:'我的判断',exact:true}).click();await page.locator('.memory-history>summary').click();
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'导出决策空间 JSON ↗'}).click()]);
 const path=await download.path(),fs=await import('node:fs/promises'),snapshot=JSON.parse(await fs.readFile(path,'utf8'));
 expect(snapshot.settings.limits.price).toBe(3000);expect(snapshot.baselineSettings.limits.price).toBe(4000);expect(snapshot.scenarios).toHaveLength(2);expect(snapshot.sources).toEqual(space.sources);
 expect((await(await request.get('/api/spaces/'+space.id)).json()).settings.limits.price).toBe(4000);
 await page.locator('#import-file').setInputFiles(path);await expect(page.locator('.universal-root')).not.toHaveAttribute('data-display-space',space.id);
 await inspector(page);await expect(page.locator('[data-live-input=price]')).toHaveValue('3000');
});

test('deleting a decision removes browser drafts for every version; cancellation keeps them and unrelated drafts intact',async({page,request})=>{
 const space=await fixture(request),other=await(await request.post('/api/spaces/demo/housing')).json();await page.goto('/#'+other.id);await inspector(page);await page.locator('[data-live-input=price]').fill('3200');
 await page.locator('#spaces [data-space="'+space.id+'"]').click();await inspector(page);await page.locator('[data-live-input=price]').fill('3000');await page.locator('[data-live-input=price]').press('Tab');
 const trigger=page.locator('#spaces [data-delete-space="'+space.id+'"]');await trigger.locator('..').hover();await trigger.click();const dialog=page.getByRole('dialog',{name:'删除这个决策空间？',exact:true});await dialog.getByRole('button',{name:'取消',exact:true}).click();
 expect(await page.evaluate(id=>localStorage.getItem('prism:workspace-draft:v1:'+id)!==null,space.id)).toBe(true);
 await trigger.click();await dialog.getByRole('button',{name:'删除空间',exact:true}).click();await expect(page.locator('#welcome')).toBeVisible();
 expect(await page.evaluate(id=>localStorage.getItem('prism:workspace-draft:v1:'+id),space.id)).toBeNull();
 expect(await page.evaluate(id=>localStorage.getItem('prism:workspace-draft:v1:'+id)!==null,other.id)).toBe(true);expect((await request.get('/api/spaces/'+space.id)).status()).toBe(404);
});
