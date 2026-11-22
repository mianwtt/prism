import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../src/server.mjs';
import {Store} from '../src/store.mjs';
import {validateDecisionSchema,decisionScenarios} from '../src/decision-schema.mjs';
import {asksForResearch} from '../src/conversation.mjs';

test('explicit research in conversation executes tools and creates one contextual branch; explanations do not run searches',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'prism-conversation-research-'));
  const schema=validateDecisionSchema({fields:[{key:'fee',label:'费用',unit:'元',direction:-1,aliases:['预算']}]});
  const original={title:'虚构测试',question:'比较测试方案，费用不超过500元',mode:'live',schema,settings:{limits:{fee:500},weights:{fee:1}},sources:[{id:'original',url:'https://example.org/a',title:'方案甲',text:'方案甲 费用300元',kind:'page',retrievedAt:new Date().toISOString()}],candidates:[{id:'a',name:'方案甲',sourceId:'original',facts:{fee:{value:300,quote:'费用300元',sourceId:'original',status:'cited'}}}],trace:[]};
  original.baselineSettings=structuredClone(original.settings);original.baselineCandidateIds=['a'];original.scenarios=decisionScenarios(original);original.activeScenarioId='scenario-baseline';
  const saved=await new Store(directory).save(original);let searches=0;
  const io={search:async()=>{searches++;return [{title:'方案乙',url:'https://example.org/b',content:'方案乙 费用400元'}];},model:async messages=>{const prompt=messages[0].content,input=JSON.parse(messages[1].content);if(prompt.startsWith('You are Prism'))return {intent:'research',reply:'当前缺少对应的公开资料，需要继续核对。',operations:[],researchNeeded:true};if(prompt.startsWith('Analyze this'))return {schema,queries:['具体新方案'],whatifs:[{name:'预算更宽',changes:[{field:'fee',value:700}]}]};if(prompt.startsWith('Analyze ONLY'))return {summary:'按费用比较',insights:[]};return {candidates:input.sources.map(s=>({name:'方案乙',sourceId:s.id,facts:{fee:{value:400,quote:'费用400元',sourceId:s.id}}}))};}};
  const app=createApp({directory,env:{},io});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await app.shutdown();await rm(directory,{recursive:true,force:true});});const base='http://127.0.0.1:'+app.address().port;
  const post=async(id,message)=>{const response=await fetch(base+'/api/spaces/'+id+'/conversation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,autoResearch:true,scenarioId:'scenario-baseline'})});assert.equal(response.status,201);return response.json();};
  const turn=await post(saved.id,'如果费用增加100，再帮我查找新的具体方案');assert.equal(turn.nextAction.type,'research');assert.equal(turn.scenarios.length,1);assert.equal(turn.settings.limits.fee,500);
  let result;
  for(let n=0;n<200;n++){const state=await(await fetch(base+'/api/jobs/'+turn.nextAction.jobId)).json();if(state.status==='failed')throw new Error(state.error);if(state.status==='complete'){result=await(await fetch(base+'/api/spaces/'+state.spaceId)).json();break;}await new Promise(r=>setTimeout(r,15));}
  assert.ok(result);assert.equal(searches,1);assert.equal(result.scenarios.length,2);assert.equal(result.settings.limits.fee,600);assert.equal(result.baselineSettings.limits.fee,500);assert.equal(result.candidates.length,2);assert.match(result.conversation.at(-1).content,/这轮已经核对完/);assert.equal(result.pendingConversationResearch,undefined);
  const explanation=await post(result.id,'为什么有些方案不符合条件');assert.equal(explanation.nextAction,undefined);assert.equal(searches,1);
  assert.equal(asksForResearch('为什么之前没有找到资料'),false);
  const semantic=await post(explanation.id,'我想多了解一下这些方案的服务保障');
  assert.equal(asksForResearch('我想多了解一下这些方案的服务保障'),false);
  assert.equal(semantic.nextAction.type,'research');assert.equal(semantic.conversation.at(-1).interaction.researchScheduled,true);
  let completed;
  for(let n=0;n<200;n++){const state=await(await fetch(base+'/api/jobs/'+semantic.nextAction.jobId)).json();if(state.status==='failed')throw new Error(state.error);if(state.status==='complete'){completed=await(await fetch(base+'/api/spaces/'+state.spaceId)).json();break;}await new Promise(r=>setTimeout(r,15));}
  assert.ok(completed);assert.ok(searches>1);assert.equal(completed.pendingConversationResearch,undefined);
  assert.equal(completed.baselineSettings.limits.fee,500);assert.equal(completed.conversation.at(-1).interaction.kind,'research-complete');
});
