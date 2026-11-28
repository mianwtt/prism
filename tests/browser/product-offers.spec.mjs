import {test,expect} from '@playwright/test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../../src/server.mjs';
import {Store} from '../../src/store.mjs';
import {commerceFixture} from '../helpers/commerce-fixture.mjs';

async function service(){
  const directory=await mkdtemp(join(tmpdir(),'prism-offers-')),fixture=commerceFixture(),store=new Store(directory),space=await store.save(fixture.space),app=createApp({directory,env:{},io:{search:async()=>[],model:async()=>({})}});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  return {space,base:'http://127.0.0.1:'+app.address().port,close:async()=>{await app.shutdown();await rm(directory,{recursive:true,force:true});}};
}
test('a user compares the same configuration across sellers and creates a price branch without overwriting the original',async({page,request})=>{
  const s=await service(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(s.base+'/#'+s.space.id);await page.getByRole('button',{name:'同款比价',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'同款多来源比价'});await expect(dialog).toBeVisible();await expect(dialog.locator('.offer-row')).toHaveCount(4);
    await expect(dialog.locator('.offer-row').filter({hasText:'测试商家乙'})).toContainText('当前采用');
    await expect(dialog.locator('.offer-row').filter({hasText:'测试优惠商家'}).getByRole('button')).toBeDisabled();
    await expect(dialog.locator('.offer-row').filter({hasText:'测试缺货商家'}).getByRole('button')).toBeDisabled();
    await dialog.locator('.offer-row').filter({hasText:'测试商家甲'}).getByRole('button',{name:'用此报价建立分支'}).click();
    await expect(page.locator('.tree-node')).toHaveCount(2);await expect(page.locator('.tree-origin')).toContainText('5,900');await expect(page.locator('.tree-branch')).toContainText('6,100');
    await expect(page.locator('.flow-condition')).toContainText('购买来源');await expect(page.locator('.flow-condition')).toContainText('测试商家甲');
    await expect(page.locator('.tree-branch .choice-badge')).toHaveText('换来源');
    await page.reload();await expect(page.locator('.tree-node')).toHaveCount(2);
    const id=new URL(page.url()).hash.slice(1),current=await (await request.get(s.base+'/api/spaces/'+id)).json();assertScope(current,s.space);expect(errors).toEqual([]);
  }finally{await s.close();}
});
function assertScope(current,previous){expect(current.scenarios[0].candidateIds).toEqual(previous.scenarios[0].candidateIds);expect(current.candidates[0].facts.price.value).toBe(5900);expect(current.candidates.at(-1).facts.price.value).toBe(6100);expect(current.scenarios.at(-1).settings).toEqual(previous.settings);expect(current.sources).toEqual(previous.sources);}

test('a proposal exports all checked seller prices and rejects a forged conditional offer over HTTP',async({page,request})=>{
  const s=await service();try{
    const c=s.space.candidates[0],conditional=c.commerce.offers.find(o=>o.basis==='conditional');
    const rejected=await request.post(s.base+'/api/spaces/'+s.space.id+'/versions',{data:{adaptive:true,scenarios:s.space.scenarios,activeScenarioId:'scenario-baseline',offerSelection:{candidateId:c.id,offerId:conditional.id}}});expect(rejected.ok()).toBe(false);
    await page.goto(s.base+'/#'+s.space.id);await page.getByRole('button',{name:'查看当前建议书',exact:false}).click();
    const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出决策建议书',exact:true}).click();const download=await downloadPromise,body=await readFile(await download.path(),'utf8');
    expect(body).toContain('同款多来源报价');expect(body).toContain('测试商家乙（当前采用）');expect(body).toContain('会员领券后专享');expect(body).toContain('缺货');
  }finally{await s.close();}
});

test('the mobile comparison stays within the viewport and keyboard closing returns to the canvas',async({page})=>{
  const s=await service();try{
    await page.setViewportSize({width:390,height:844});await page.goto(s.base+'/#'+s.space.id);await page.getByRole('button',{name:'同款比价',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'同款多来源比价'});await expect(dialog).toBeVisible();expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'同款比价',exact:true})).toBeFocused();
  }finally{await s.close();}
});
test('SearXNG setup exposes a service URL instead of requiring tofu installation or a commercial key',async({page,request})=>{
  const s=await service();try{
    await page.goto(s.base);await page.locator('#settings-button').click();await page.locator('#search-provider').selectOption('searxng');
    await expect(page.locator('#searxng-field')).toBeVisible();await expect(page.locator('#search-key-field')).toBeHidden();
    await page.locator('#model-url').fill('http://localhost:11434/v1');await page.locator('#model-name').fill('test-qwen');await page.locator('#model-key').fill('ollama');await page.locator('#searxng-url').fill('http://127.0.0.1:8080');await page.locator('#save-settings').click();
    await expect(page.locator('#settings-dialog')).not.toBeVisible();const status=await (await request.get(s.base+'/api/settings')).json();expect(status.searchProvider).toBe('searxng');expect(status.ready).toBe(true);expect(status.hasSearchKey).toBe(false);
  }finally{await s.close();}
});
