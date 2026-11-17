import {test,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../../src/server.mjs';
async function service(){
 const directory=await mkdtemp(join(tmpdir(),'prism-workflow-browser-'));let currentText='方案甲 费用300元，通勤20分钟。',searches=0;
 const fee={key:'fee',label:'费用',unit:'元',direction:-1,aliases:['预算'],step:100},commute={key:'commute',label:'通勤',unit:'分钟',direction:-1,step:10},quiet={key:'quiet',label:'安静',type:'boolean',preferred:true,direction:1};
 const io={search:async()=>{searches++;return [{url:'https://example.org/software-fixture/a',title:'方案甲 · 软件测试虚构来源',content:currentText}];},fetchSource:async()=>currentText,model:async messages=>{
  const prompt=messages[0].content,input=JSON.parse(messages[1].content);
  if(prompt.startsWith('Analyze this')){const adding=String(input.change||'').includes('安静');if(adding)currentText='方案甲 费用300元，通勤20分钟。明确说明环境安静。';return {schema:{label:'具体方案的取舍',optionLabel:'方案',fields:adding?[fee,commute,quiet]:[fee,commute]},constraints:adding?[{field:'quiet',value:true,quote:'需要安静'}]:[],queries:['software fixture'],whatifs:[{name:'如果费用400元',changes:[{field:'fee',value:400}]}]};}
  if(prompt.startsWith('Propose'))return {whatifs:[]};
  if(prompt.startsWith('Analyze ONLY'))return {summary:'可以查看保存引用，再根据个人偏好判断。',insights:[]};
  const source=input.sources?.[0];return {candidates:[{name:'方案甲',sourceId:source.id,facts:{fee:{value:300,sourceId:source.id,quote:'费用300元'},commute:{value:20,sourceId:source.id,quote:'通勤20分钟'},...(currentText.includes('安静')?{quiet:{value:true,sourceId:source.id,quote:'明确说明环境安静'}}:{})}}]};
 }};
 const app=createApp({directory,env:{},io});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.address().port;
 const post=async(path,data)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(JSON.stringify(result));return result;};
 const job=await post('/api/research',{question:'帮我比较具体方案，预算500元，通勤不超过30分钟。',adaptive:true});let space;
 for(let n=0;n<200;n++){const state=await(await fetch(base+'/api/jobs/'+job.id)).json();if(state.status==='complete'){space=await(await fetch(base+'/api/spaces/'+state.spaceId)).json();break;}if(state.status==='failed')throw new Error(state.error);await new Promise(r=>setTimeout(r,15));}
 if(!space)throw new Error('Initial job timed out');
 return {base,space,setText:text=>currentText=text,searches:()=>searches,get:async id=>(await fetch(base+'/api/spaces/'+id)).json(),close:async()=>{await app.shutdown();await rm(directory,{recursive:true,force:true});}};
}
test('evidence confirmation, immutable decision context and source recheck form a real HTTP journey',async({page})=>{
 const serviceState=await service();try{
 const {base,space}=serviceState;const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/#'+space.id);
 await page.locator('[data-u-pane=evidence]').click();await page.locator('[data-confirm-fact=fee]').click();
 await expect(page.locator('.evidence-field.confirmed')).toContainText('已人工确认');
 const confirmedId=await page.evaluate(()=>location.hash.slice(1));const confirmed=await serviceState.get(confirmedId);expect(confirmed.candidates[0].facts.fee.status).toBe('confirmed');expect((await serviceState.get(space.id)).candidates[0].facts.fee.status).toBe('cited');
 await page.locator('[data-withdraw-fact=fee]').click();await expect(page.locator('[data-evidence-field=fee].cited')).toContainText('有保存引用');
 await page.locator('[data-u-pane=memory]').click();await page.locator('#u-record select[name=candidateId]').selectOption(space.candidates[0].id);await page.locator('#u-record textarea').fill('软件测试：预算和通勤都合适，保留当时的引用。');await page.getByRole('button',{name:'保存这次判断',exact:true}).click();
 await expect(page.locator('.recorded-choice')).toContainText('方案甲');const decisionId=await page.evaluate(()=>location.hash.slice(1)),recorded=await serviceState.get(decisionId);expect(recorded.decision.context.settings.limits.fee).toBe(500);expect(recorded.decision.context.candidateFacts.fee.value).toBe(300);
 await page.reload();await page.locator('[data-u-pane=memory]').click();await expect(page.locator('.recorded-choice')).toContainText('软件测试：预算和通勤都合适');
 serviceState.setText('方案甲 费用600元，通勤20分钟。');await page.locator('.space-menu>summary').click();await page.locator('[data-u-pane=research]').first().click();await page.getByRole('button',{name:'核对已有来源',exact:true}).click();await expect(page.locator('.refresh-result')).toContainText('1 项引用未能验证',{timeout:15000});
 expect(serviceState.searches()).toBe(1);const refreshed=await serviceState.get(await page.evaluate(()=>location.hash.slice(1)));expect(refreshed.candidates[0].facts.fee.status).toBe('unknown');expect(refreshed.candidates[0].facts.fee.value).toBe(300);expect(recorded.decision.context.candidateFacts.fee.value).toBe(300);
 await page.locator('[data-u-pane=memory]').click();await expect(page.locator('.decision-reassessment.has-changes')).toContainText('这次判断值得再看看');await page.locator('.memory-history>summary').click();await expect(page.locator('#u-version-diff')).toContainText('有引用 → 未能验证');
 await page.locator('.decision-context summary').click();await expect(page.locator('.decision-context')).toContainText('费用300元');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);
 }finally{await page.goto('about:blank');await serviceState.close();}
});
test('continuing research from its page runs the actual adaptive graph and preserves the original situation',async({page})=>{
 const s=await service();try{
 await page.goto(s.base+'/#'+s.space.id);await page.locator('.space-menu>summary').click();await page.locator('[data-u-pane=research]').first().click();await page.locator('#followup-message').fill('还需要安静，请继续核对公开依据');await page.getByRole('button',{name:'继续研究 ↗',exact:true}).click();
 await expect(page.locator('.research-conditions')).toContainText('安静',{timeout:15000});const after=await s.get(await page.evaluate(()=>location.hash.slice(1)));expect(after.schema.fields.some(f=>f.key==='quiet')).toBe(true);expect(after.baselineSettings.limits.quiet).toBe(null);expect(after.candidates.some(c=>c.facts.quiet?.value===true)).toBe(true);expect(s.searches()).toBe(2);
 await page.locator('[data-u-pane=canvas]').first().click();await expect(page.locator('.flow-row')).toHaveCount(2);await expect(page.locator('.tree-origin .board-limits')).not.toContainText('安静');
 await expect(page.locator(`[data-flow-row="${s.space.scenarios[1].id}"]`)).toBeVisible();
 await page.locator(`[data-flow-condition="${after.activeScenarioId}"] [data-tree-condition]`).click();await expect(page.locator('.canvas-inspector')).toContainText('安静');
 }finally{await page.goto('about:blank');await s.close();}
});
test('an explicit research request in conversation runs tools and returns results without opening a process panel',async({page})=>{
 const s=await service();try{
 await page.goto(s.base+'/#'+s.space.id);await page.locator('[data-tree-compose]').first().click();
 await page.locator('#conversation-message').fill('继续帮我查找安静的公开依据');await page.locator('#u-conversation').evaluate(form=>form.requestSubmit());
 await expect(page.locator('.conversation-messages')).toContainText('这轮已经核对完公开资料',{timeout:15000});
 await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#job-panel')).toBeHidden();expect(s.searches()).toBe(2);
 const after=await s.get(await page.evaluate(()=>location.hash.slice(1)));expect(after.scenarios).toHaveLength(s.space.scenarios.length+1);expect(after.baselineSettings.limits.quiet).toBe(null);expect(after.candidates.some(c=>c.facts.quiet?.value===true)).toBe(true);
 }finally{await page.goto('about:blank');await s.close();}
});
