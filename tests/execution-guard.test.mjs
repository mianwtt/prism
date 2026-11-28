import test from 'node:test';
import assert from 'node:assert/strict';
import {executionGuard} from '../src/agents/execution-guard.mjs';
import {createSpecialist} from '../src/agents/specialist.mjs';

const usage=()=>({modelCalls:0,toolCalls:{},inputCharacters:0,outputCharacters:0});

test('execution guard blocks budget overflow before performing more external work',async()=>{
  const record=usage(),guard=executionGuard('researcher','search',['search'],record,{toolCalls:1});
  let loaded=0;
  await guard.call('search',['q'],async()=>{loaded++;return [];});
  await assert.rejects(guard.call('search',['q'],async()=>{loaded++;}),{code:'tool-budget'});
  assert.equal(loaded,1);
  assert.equal(record.toolCalls.search,1);
  assert.equal(record.hooks.at(-1).status,'blocked');
});

test('context and capability gates prevent operations and failed calls still consume budget',async()=>{
  const record=usage(),guard=executionGuard('reviewer','review',['model'],record,{modelCalls:1,contextCharacters:25});
  await assert.rejects(guard.call('search',[],()=>assert.fail('forbidden')),{code:'permission'});
  await assert.rejects(guard.call('model',['x'.repeat(30)],()=>assert.fail('oversized')),{code:'context-budget'});
  assert.equal(record.modelCalls,0);
  await assert.rejects(guard.call('model',[],async()=>{throw new Error('controlled failure');}));
  assert.equal(record.modelCalls,1);
  await assert.rejects(guard.call('model',[],()=>assert.fail('repeat')),{code:'model-budget'});
});

test('specialist handoff preserves role skills and version fingerprints without persisting raw prompts',async()=>{
  const specialist=createSpecialist('reviewer',{review:async(task,io)=>({evidenceReview:await io.model([{role:'user',content:'private-text'}])})},{model:async()=>({findings:[]})});
  const result=await specialist.invoke({phase:'review',task:{question:'核对已保存的资料',taskMemory:{text:'用户背景'}}});
  assert.equal(result.usage.handoff.hasTaskMemory,true);
  assert.equal(result.usage.handoff.reviewFindings,0);
  assert.equal(result.usage.handoff.taskFingerprint.length,64);
  assert.ok(result.usage.skills.length);
  assert.equal(JSON.stringify(result.usage).includes('private-text'),false);
  assert.equal(result.usage.hooks.at(-1).hook,'handoff');
});
