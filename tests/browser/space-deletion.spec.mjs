import {test,expect} from '@playwright/test';
test('sidebar deletion confirms the whole decision, removes all versions and recent entries, and stays deleted on reload',async({page,request})=>{
 const original=await(await request.post('/api/spaces/demo/housing')).json();
 const saved=await(await request.post('/api/spaces/'+original.id+'/versions',{data:{adaptive:true,scenarios:original.scenarios}})).json();
 const other=await(await request.post('/api/spaces/demo')).json();
 const sameTitle=await(await request.post('/api/spaces/demo/housing')).json();
 await page.goto('/#'+saved.id);const trigger=page.locator(`#spaces [data-delete-space="${saved.id}"]`);
 await trigger.locator('..').hover();await trigger.click();const dialog=page.getByRole('dialog',{name:'删除这个决策空间？'});
 await expect(dialog).toContainText('全部历史版本');await dialog.getByRole('button',{name:'取消',exact:true}).click();
 expect((await request.get('/api/spaces/'+original.id)).status()).toBe(200);
 await trigger.click();await dialog.getByRole('button',{name:'删除空间',exact:true}).click();await expect(dialog).not.toBeVisible();
 await expect(page.locator('#welcome')).toBeVisible();await expect(page.locator('#spaces [data-space="'+saved.id+'"]')).toHaveCount(0);
 expect((await request.get('/api/spaces/'+original.id)).status()).toBe(404);expect((await request.get('/api/spaces/'+saved.id)).status()).toBe(404);
 expect((await request.get('/api/spaces/'+other.id)).status()).toBe(200);
 await page.reload();await expect(page.locator('#home-recent [data-space="'+original.id+'"],#home-recent [data-space="'+saved.id+'"]')).toHaveCount(0);await expect(page.locator('#spaces [data-space="'+other.id+'"]')).toHaveCount(1);
 expect((await request.get('/api/spaces/'+sameTitle.id)).status()).toBe(200);await expect(page.locator('#spaces [data-space="'+sameTitle.id+'"]')).toHaveCount(1);
});

test('deleting an inactive space leaves the open canvas and its local record intact',async({page,request})=>{
 const current=await(await request.post('/api/spaces/demo/housing')).json(),other=await(await request.post('/api/spaces/demo')).json();await page.goto('/#'+current.id);
 const trigger=page.locator(`#spaces [data-delete-space="${other.id}"]`);await trigger.locator('..').hover();await trigger.click();await page.getByRole('dialog',{name:'删除这个决策空间？'}).getByRole('button',{name:'删除空间',exact:true}).click();
 await expect(page.locator('.u-heading h1')).toHaveText(current.title);expect(await page.evaluate(()=>location.hash.slice(1))).toBe(current.id);
 await expect(page.locator('#spaces [data-space="'+other.id+'"]')).toHaveCount(0);expect((await request.get('/api/spaces/'+current.id)).status()).toBe(200);
});
