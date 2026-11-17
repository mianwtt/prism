import test from 'node:test';
import assert from 'node:assert/strict';
import {completeFixture} from './browser/complete-space.fixture.mjs';
import {mergeScenarioResearch,prepareScenario} from '../src/scenario-research.mjs';
import {editSpace} from '../src/space-edits.mjs';
import {scenarioCandidates} from '../src/scenarios.mjs';

test('a new branch inherits its actual parent discovery pool through save and research, while baseline stays isolated',()=>{
 const original=completeFixture(),incoming=completeFixture();
 incoming.candidates=incoming.candidates.slice(0,1);incoming.candidates[0].id='third';
 incoming.candidates[0].productData.sourceProductUrl='https://m.suning.com/product/000/999.html';
 const parentBranch={id:'discovered-branch',name:'已有扩展研究',settings:original.settings};
 const expanded=mergeScenarioResearch(original,incoming,{id:'abcd1234-task',scenarioId:parentBranch.id,scenarios:[...original.scenarios,parentBranch],events:[]});
 const child={id:'child',parentScenarioId:parentBranch.id,name:'收紧预算',settings:{...original.settings,budget:5000},candidateIds:['fake'],research:{summary:'fake'}};
 const saved=editSpace(expanded,{scenarios:[...expanded.scenarios,child],activeScenarioId:child.id});
 assert.equal(scenarioCandidates(saved,saved.scenarios.at(-1)).length,3);
 assert.equal(scenarioCandidates(saved,saved.scenarios[0]).length,2);
 assert.equal(saved.scenarios.at(-1).research,undefined);
 const prepared=prepareScenario(saved,saved.scenarios,child.id);
 assert.deepEqual(prepared.selected.candidateIds,saved.scenarios.at(-1).candidateIds);
 assert.deepEqual(expanded.candidates.slice(0,2),original.candidates);
});
test('unknown and cyclic branch parents are rejected rather than trusting posted candidate membership',()=>{
 const p=completeFixture();
 const branch=(id,parentScenarioId)=>({id,parentScenarioId,name:id,settings:p.settings});
 assert.throws(()=>prepareScenario(p,[branch('a','missing')],'a'),/父情景不存在/);
 assert.throws(()=>prepareScenario(p,[branch('a','b'),branch('b','a')],'a'),/循环/);
 const valid=prepareScenario(p,[{...branch('x',p.scenarios[0].id),candidateIds:['fake']}],'x');
 assert.deepEqual(valid.selected.candidateIds,p.candidates.map(c=>c.id));
});
