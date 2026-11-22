import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {housingDemo} from '../src/general-space.mjs';
import {readWorkspaceDraft,writeWorkspaceDraft,clearWorkspaceDraft,clearWorkspaceDrafts,exportWorkspaceSnapshot} from '../src/workspace-draft.mjs';

function storage(){const entries=new Map();return {get length(){return entries.size;},key:i=>[...entries.keys()][i],getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};}
function fixture(){const s=housingDemo();s.id=randomUUID();s.rootId=s.id;return s;}
function state(s){const scenarios=structuredClone(s.scenarios);scenarios.push({id:'local-path',name:'如果月租3000',parentScenarioId:'scenario-baseline',settings:{...structuredClone(s.settings),limits:{...s.settings.limits,price:3000}},candidateIds:s.candidates.map(c=>c.id)});return {scenarios,activeScenarioId:'local-path',canvasScenarioIds:scenarios.map(s=>s.id),dirty:true,pane:'canvas',chatDraft:'这个方案的取舍是什么？',researchDraft:'继续核对来源',decisionDraft:{candidateId:s.candidates[0].id,rationale:'还未提交的个人判断'}};}

test('a local condition draft survives a remount with typed inputs while saved sources, baseline and original version stay untouched',()=>{
 const s=fixture(),original=structuredClone(s),draft=state(s),cache=storage();
 assert.equal(writeWorkspaceDraft(s,draft,cache),true);const restored=readWorkspaceDraft(s,cache);
 assert.equal(restored.scenarios.find(b=>b.id==='local-path').settings.limits.price,3000);assert.equal(restored.chatDraft,draft.chatDraft);assert.deepEqual(restored.decisionDraft,draft.decisionDraft);assert.deepEqual(s,original);
 const other={...s,id:randomUUID()};assert.equal(readWorkspaceDraft(other,cache),null);
});

test('export contains the visible unsaved branch settings and preserves the immutable baseline, quotations and source photos',()=>{
 const s=fixture(),original=structuredClone(s),exported=exportWorkspaceSnapshot(s,state(s));
 assert.equal(exported.settings.limits.price,3000);assert.equal(exported.activeScenarioId,'local-path');assert.deepEqual(exported.baselineSettings,s.baselineSettings);assert.deepEqual(exported.sources,s.sources);assert.deepEqual(exported.candidates,s.candidates);assert.deepEqual(s,original);
});

test('draft validation rejects corrupted branch references and cannot overwrite baseline conditions',()=>{
 const s=fixture(),draft=state(s),cache=storage();draft.scenarios[0].settings.limits.price=999;writeWorkspaceDraft(s,draft,cache);
 assert.equal(readWorkspaceDraft(s,cache).scenarios[0].settings.limits.price,s.baselineSettings.limits.price);
 draft.scenarios.at(-1).parentScenarioId='missing';writeWorkspaceDraft(s,draft,cache);assert.equal(readWorkspaceDraft(s,cache),null);
 assert.throws(()=>exportWorkspaceSnapshot(s,draft),/分支来源/);
});

test('restoring or exporting a local child of a scoped research branch never widens its source pool',()=>{
 const s=fixture(),parent={id:'researched',name:'独立研究路径',parentScenarioId:'scenario-baseline',settings:structuredClone(s.settings),candidateIds:[s.candidates[0].id]};s.scenarios.push(parent);
 const draft=state(s);draft.scenarios.at(-1).parentScenarioId=parent.id;draft.scenarios.at(-1).candidateIds=[s.candidates[0].id];
 const exported=exportWorkspaceSnapshot(s,draft);assert.deepEqual(exported.scenarios.at(-1).candidateIds,[s.candidates[0].id]);
 draft.scenarios.at(-1).candidateIds=[s.candidates[1].id];assert.throws(()=>exportWorkspaceSnapshot(s,draft),/路径之外/);
});

test('deleting a decision clears its drafts for all versions but preserves unrelated workspaces',()=>{
 const a=fixture(),b={...a,id:randomUUID()},other=fixture(),cache=storage();for(const s of [a,b,other])writeWorkspaceDraft(s,state(s),cache);
 clearWorkspaceDrafts(a.rootId,cache);assert.equal(readWorkspaceDraft(a,cache),null);assert.equal(readWorkspaceDraft(b,cache),null);assert(readWorkspaceDraft(other,cache));
 clearWorkspaceDraft(other.id,cache);assert.equal(cache.length,0);
});

test('unavailable browser storage is reported without throwing, so the UI can guard an otherwise unsaved exit',()=>{
 const s=fixture(),cache={setItem(){throw new Error('quota');},getItem(){return null;}};
 assert.equal(writeWorkspaceDraft(s,state(s),cache),false);assert.equal(readWorkspaceDraft(s,cache).activeScenarioId,'local-path');clearWorkspaceDraft(s.id,cache);
});
