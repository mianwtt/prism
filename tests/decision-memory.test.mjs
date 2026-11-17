import test from 'node:test';
import assert from 'node:assert/strict';
import {demoSpace} from '../src/demo.mjs';
import {editSpace,diffSpaces} from '../src/space-edits.mjs';

test('a decision records the user choice and reason without rewriting product evidence or the original version',()=>{
 const before=demoSpace(),snapshot=structuredClone(before);
 const after=editSpace(before,{decision:{candidateId:'forge',rationale:'更重一些，但预算更宽裕。',recordedAt:'forged'}});
 assert.equal(after.decision.candidateId,'forge');assert.equal(after.decision.candidateName,'Forge 15');
 assert.equal(after.decision.rationale,'更重一些，但预算更宽裕。');assert.notEqual(after.decision.recordedAt,'forged');
 assert.deepEqual(after.candidates,before.candidates);assert.deepEqual(before,snapshot);
 assert.equal(diffSpaces(before,after).decisionChange.after.candidateName,'Forge 15');
 assert.deepEqual(editSpace(after,{settings:{...after.settings,budget:8000}}).decision,after.decision);
});
test('undecided notes are valid, while blank records and foreign candidate IDs are rejected',()=>{
 const p=demoSpace();
 assert.equal(editSpace(p,{decision:{candidateId:null,rationale:'等待确认重量。'}}).decision.candidateId,null);
 assert.throws(()=>editSpace(p,{decision:{candidateId:'foreign',rationale:'invalid'}}),/当前空间/);
 assert.throws(()=>editSpace(p,{decision:{candidateId:null,rationale:' '}}),/请选择/);
 assert.throws(()=>editSpace(p,{decision:{candidateId:null,rationale:'x'.repeat(1501)}}),/1500/);
});
