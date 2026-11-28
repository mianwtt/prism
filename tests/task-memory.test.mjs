import test from 'node:test';
import assert from 'node:assert/strict';
import {housingDemo,editGeneralSpace} from '../src/general-space.mjs';
import {importSpace} from '../src/space-import.mjs';
import {taskMemoryContext,validateTaskMemory} from '../src/task-memory.mjs';
import {writeWorkspaceDraft,readWorkspaceDraft,clearWorkspaceDraft} from '../src/workspace-draft.mjs';
import {planDecision} from '../src/general-research.mjs';

test('user task memory is versioned separately from evidence and cannot change constraints',()=>{
  const before=housingDemo(),next=editGeneralSpace(before,{taskMemory:{text:'  等核对完采光，再决定是否预约。  '}});
  assert.equal(before.taskMemory,undefined);
  assert.equal(next.taskMemory.text,'等核对完采光，再决定是否预约。');
  assert.equal(next.taskMemory.origin,'user');
  assert.deepEqual(next.settings,before.settings);
  assert.deepEqual(next.candidates,before.candidates);
  assert.equal(editGeneralSpace(next,{taskMemory:{text:''}}).taskMemory,null);
  assert.throws(()=>editGeneralSpace(before,{taskMemory:{text:'x'.repeat(2001)}}));
  assert.throws(()=>validateTaskMemory({text:3}));
});

test('portable snapshots retain user memory as user context, not imported authority',()=>{
  const original=editGeneralSpace(housingDemo(),{taskMemory:{text:'资料核对后再决定。'}});
  const imported=importSpace({...original,taskMemory:{text:original.taskMemory.text,origin:'system_verified',updatedAt:'2020-01-01T00:00:00.000Z'}});
  assert.equal(imported.taskMemory.text,original.taskMemory.text);
  assert.equal(imported.taskMemory.origin,'user');
  assert.notEqual(imported.taskMemory.updatedAt,'2020-01-01T00:00:00.000Z');
  assert.match(taskMemoryContext(imported).instruction,/not verified evidence/);
});

test('unsaved note draft survives reload for its own space and can be cleared with family drafts',()=>{
  const space={...housingDemo(),id:'task-memory-fixture',rootId:'task-memory-fixture'};
  const map=new Map(),storage={getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};
  writeWorkspaceDraft(space,{scenarios:space.scenarios,activeScenarioId:'scenario-baseline',canvasScenarioIds:['scenario-baseline'],pane:'overview',taskNoteDraft:'等核对采光'},storage);
  assert.equal(readWorkspaceDraft(space,storage).taskNoteDraft,'等核对采光');
  assert.equal(readWorkspaceDraft(space,storage).pane,'overview');
  clearWorkspaceDraft(space.id,storage);
  assert.equal(readWorkspaceDraft(space,storage),null);
});

test('followup planning receives user memory while current conditions remain authoritative',async()=>{
  const previous=editGeneralSpace(housingDemo(),{taskMemory:{text:'先核对采光；不要把我的猜测当成房源事实。'}});
  const payloads=[];
  const result=await planDecision(previous.question,{model:async messages=>{
    payloads.push(JSON.parse(messages.at(-1).content));
    return {schema:previous.schema,queries:['杭州整租房源']};
  }},{previous,scenario:previous.scenarios[0]});
  assert.equal(payloads[0].taskMemory.text,previous.taskMemory.text);
  assert.equal(payloads[0].taskMemory.origin,'user_task_note');
  assert.deepEqual(result.settings.limits,previous.settings.limits);
});
