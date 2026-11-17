import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDecisionBranches} from '../src/branch-comparison.mjs';
import {housingDemo} from '../src/general-space.mjs';
import {decisionScenarios,validateDecisionSchema} from '../src/decision-schema.mjs';

test('two arbitrary sibling branches explain membership with the exact condition and stored source',()=>{
 const space=housingDemo(),baseline=decisionScenarios(space)[0],original=structuredClone(space);
 const a={...structuredClone(baseline),id:'budget',name:'少一点租金',settings:{...baseline.settings,limits:{...baseline.settings.limits,price:3500}}};
 const b={...structuredClone(baseline),id:'area',name:'更大的空间',settings:{...baseline.settings,limits:{price:5000,area:50,commute:45}}};
 const report=compareDecisionBranches(space,a,b);
 assert.equal(report.scope.same,true);assert.equal(report.mode,'recalculate');
 assert.equal(report.counts.entered,1);assert.equal(report.counts.exited,1);
 const exit=report.records.find(r=>r.category==='exited');
 assert.ok(exit.reasons.some(r=>r.fieldKey==='area'&&r.message.includes('50㎡')&&r.evidence.quote.includes('月租')));
 assert.ok(exit.reasons.every(r=>!r.evidence||r.evidence.support==='example'));
 assert.deepEqual(space,original);assert.ok(report.tradeoffs.some(r=>r.field.key==='area'));
});

test('a different discovery pool never gets explained as a constraint-caused entry or exit',()=>{
 const space=housingDemo(),a=decisionScenarios(space)[0],b={...structuredClone(a),id:'other',candidateIds:[space.candidates[1].id]};
 const report=compareDecisionBranches(space,a,b);
 assert.equal(report.scope.same,false);
  assert.equal(report.mode,'scope');
 const removed=report.records.filter(r=>r.category==='exited');assert.ok(removed.length);
 assert.ok(removed.every(r=>r.reasons.length===1&&r.reasons[0].kind==='scope'));
 const reversed=compareDecisionBranches(space,b,a);
 assert.ok(reversed.records.filter(r=>r.category==='entered').every(r=>r.reasons[0].kind==='scope'));
 assert.equal(report.snapshot.demo,true);
});

test('generic enum, boolean and review requirements preserve evidence gaps instead of fabricating tradeoffs',()=>{
 const schema=validateDecisionSchema({fields:[{key:'pets',label:'允许带猫',type:'boolean',direction:1},{key:'light',label:'采光',type:'enum',options:['充足','一般'],direction:1}]});
 const a={id:'a',name:'原条件',settings:{limits:{pets:true,light:null},weights:{pets:1,light:0}},candidateIds:['one']},b=structuredClone(a);b.id='b';b.settings.limits.light='充足';
 const space={mode:'live',schema,sources:[],candidates:[{id:'one',name:'记录甲',facts:{pets:{value:true,status:'cited',sourceId:'missing',quote:'允许带猫'},light:{value:null,status:'unknown'}}}]};
 const report=compareDecisionBranches(space,a,b),exit=report.records[0];
 assert.equal(exit.category,'exited');assert.equal(exit.reasons[0].kind,'missing');assert.equal(exit.reasons[0].fieldKey,'light');
 assert.equal(exit.reasons[0].evidence.support,'unsupported');
 const reviewed=structuredClone(a);reviewed.settings.evidenceMode='reviewed';
 assert.equal(compareDecisionBranches(space,a,reviewed).records[0].reasons[0].kind,'review');
 assert.ok(compareDecisionBranches(space,a,a).counts.retained===1);
});

test('preference-only comparisons keep candidates and disclose ranking changes rather than invented quality percentages',()=>{
 const space=housingDemo(),a=decisionScenarios(space)[0],b=structuredClone(a);b.id='preferences';
 b.settings.weights={price:0,area:1,commute:0};
 const report=compareDecisionBranches(space,a,b);
 assert.equal(report.conditionChanges.length,0);assert.ok(report.preferenceChanges.length);
 assert.equal(report.counts.entered,0);assert.equal(report.counts.exited,0);
 assert.ok(report.records.filter(r=>r.category==='retained').every(r=>r.rank));
  assert.ok(report.records.filter(r=>r.category==='retained').every(r=>r.reasons.every(reason=>reason.kind==='preference'&&reason.evidence)));
});
