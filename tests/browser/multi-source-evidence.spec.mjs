import {test,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../../src/server.mjs';

test('actual graph combines explicit identifiers, shows conflicting sources and requires choosing an observation before ranking',async({page})=>{
  const directory=await mkdtemp(join(tmpdir(),'prism-multisource-browser-'));
  const pages=[
    {url:'https://maker.example.org/offer',title:'测试电脑甲',text:'测试电脑甲 SKU ABC1000-X。内存24GB。'},
    {url:'https://shop.example.com/offer',title:'测试电脑甲 店铺配置',text:'测试电脑甲 店铺配置 SKU ABC1000-X。价格5000元。内存24GB。'},
    {url:'https://compare.example.net/offer',title:'测试电脑甲 对照配置',text:'测试电脑甲 对照配置 SKU ABC1000-X。价格5100元。内存24GB。'},
  ];
  const schema={fields:[{key:'price',label:'价格',unit:'元',direction:-1,aliases:['预算']},{key:'memory',label:'内存',unit:'GB',direction:1}]};
  const io={search:async()=>pages.map(s=>({...s,content:s.text})),fetchSource:async url=>pages.find(s=>s.url===url).text,model:async messages=>{
    const prompt=messages[0].content,input=JSON.parse(messages[1].content);
    if(prompt.startsWith('Analyze this'))return {schema,queries:['虚构配置核对']};if(prompt.startsWith('Propose'))return {whatifs:[]};if(prompt.startsWith('Analyze ONLY'))return {summary:'价格存在分歧，需要核对。',insights:[]};
    return {candidates:input.sources.map(s=>{const value=s.text.includes('5100')?5100:s.text.includes('5000')?5000:null;return {name:s.title,sourceId:s.id,identity:{namespace:'product-model',value:'ABC1000-X',quote:s.title+' SKU ABC1000-X'},facts:{memory:{value:24,sourceId:s.id,quote:'内存24GB'},...(value?{price:{value,sourceId:s.id,quote:'价格'+value+'元'}}:{})}};})};
  }};
  const app=createApp({directory,env:{},io});await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port;
  try{
    const job=await(await fetch(base+'/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'比较测试电脑，预算6000元，内存至少16GB',adaptive:true})})).json();let result;
    for(let n=0;n<200;n++){const state=await(await fetch(base+'/api/jobs/'+job.id)).json();if(state.status==='failed')throw new Error(state.error);if(state.status==='complete'){result=await(await fetch(base+'/api/spaces/'+state.spaceId)).json();break;}await new Promise(r=>setTimeout(r,15));}
    expect(result.candidates).toHaveLength(1);expect(result.candidates[0].facts.price.value).toBe(null);
    await page.goto(base+'/#'+result.id);await page.locator('[data-u-pane=evidence]').click();
    await expect(page.locator('.evidence-candidates [data-evidence-candidate]')).toHaveCount(1);await expect(page.locator('.evidence-detail > header')).toContainText('3 份关联资料');
    await expect(page.locator('.evidence-identity')).toContainText('ABC1000-X');await page.locator('.evidence-identity summary').click();await expect(page.locator('.evidence-identity')).toContainText('店铺配置');
    await expect(page.locator('[data-evidence-field=price]')).toContainText('来源给出了不同值');await expect(page.locator('[data-confirm-fact=price]')).toHaveCount(2);
    await page.locator('[data-confirm-fact=price]').first().click();await expect(page.locator('[data-evidence-field=price]')).toContainText('已人工确认');
    await page.locator('[data-u-pane=canvas]').click();await expect(page.locator('.tree-origin .tree-choice')).toHaveCount(1);
    const old=await(await fetch(base+'/api/spaces/'+result.id)).json();expect(old.candidates[0].facts.price.value).toBe(null);
  }finally{await page.goto('about:blank');await app.shutdown();await rm(directory,{recursive:true,force:true});}
});
