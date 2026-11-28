import test from 'node:test';
import assert from 'node:assert/strict';
import {housingDemo,editGeneralSpace} from '../src/general-space.mjs';
import {converse} from '../src/conversation.mjs';
import {decisionProposal} from '../src/decision-proposal.mjs';
import {buildDecisionAnswer} from '../src/decision-answer.mjs';
import {decisionReport} from '../src/decision-report.mjs';
import {importSpace} from '../src/space-import.mjs';

function live(){const space=housingDemo();space.mode='live';for(const s of space.sources){s.kind='page';s.url='https://example.org/software-fixture/'+s.id;}for(const c of space.candidates)for(const f of Object.values(c.facts))f.status='cited';return space;}
function analyzed(space){const branch=space.scenarios[0],answer=buildDecisionAnswer({recommendations:[{candidateId:'housing-0',fields:['price','commute'],reason:'租金3200元，接受42分钟通勤，以控制月度支出。'}]},space,branch);space.conversation=[{role:'assistant',scenarioId:branch.id,content:answer.summary,decisionAnswer:answer}];return space;}

test('a proposal joins a fresh bound recommendation, actual tradeoffs, alternative options and numbered source quotations',()=>{
  const space=analyzed(live()),before=structuredClone(space),p=decisionProposal(space,space.scenarios[0]);
  assert.equal(p.origin,'model');assert.equal(p.state,'reviewable');assert.equal(p.recommendations[0].name,'沿河一居');
  assert.equal(p.alternatives[0].name,'地铁旁一居');assert.equal(p.references[0].referenceId,'E1');
  assert.ok(p.references.every(r=>space.sources.find(s=>s.id===r.sourceId).text.includes(r.quote)));
  const comparison=p.comparisons.find(c=>c.candidateId==='housing-0'&&c.otherId==='housing-1');
  assert.ok(comparison.strengths.some(c=>c.field==='price'));assert.ok(comparison.sacrifices.some(c=>c.field==='commute'));
  assert.deepEqual(space,before);
});

test('page and Markdown deliver the same current recommendation and its actual reference text',()=>{
  const space=analyzed(live()),p=decisionProposal(space,space.scenarios[0]),report=decisionReport(space,space.scenarios[0]);
  assert.match(report,/决策建议书/);assert.ok(report.includes(p.recommendations[0].reason));
  assert.ok(report.includes(p.references[0].quote));assert.match(report,/E1/);assert.match(report,/可保留的备选方案/);
  assert.match(report,/需要接受的取舍/);assert.match(report,/尚未记录最终选择/);
});

test('stale or other-branch advice cannot become the current proposal, and rules are labeled as screening',()=>{
  const space=analyzed(live()),branch=structuredClone(space.scenarios[0]);branch.settings.limits.price=3500;
  const p=decisionProposal(space,branch);
  assert.equal(p.hasCurrentAnalysis,false);assert.equal(p.origin,'rules');assert.equal(p.state,'screened');
  assert.ok(p.recommendations.every(r=>r.reason!=='租金3200元，接受42分钟通勤，以控制月度支出。'));
  assert.equal(decisionProposal(space,{...space.scenarios[0],id:'other'}).hasCurrentAnalysis,false);
});

test('an evidence-follow-up receipt is not mistaken for a completed model recommendation',()=>{
  const space=analyzed(live());space.conversation[0].decisionAnswer.kind='investigation';
  const p=decisionProposal(space,space.scenarios[0]);assert.equal(p.origin,'rules');assert.equal(p.hasCurrentAnalysis,false);
});

test('a proposal with no trustworthy eligible candidate stays incomplete instead of inventing a recommendation',()=>{
  const space=live();for(const c of space.candidates)c.facts.price={value:100,status:'cited',sourceId:c.sourceId,quote:'不存在的便宜报价'};
  const p=decisionProposal(space,space.scenarios[0]);assert.equal(p.state,'needs-evidence');assert.equal(p.recommendations.length,0);assert.equal(p.counts.eligible,0);
  assert.ok(p.checks.length);assert.equal(p.references.some(r=>r.quote==='不存在的便宜报价'),false);
});

test('branch-scoped experiments report each branch pool without expanding the original baseline',()=>{
  const space=live(),parent=space.scenarios[0],child={...structuredClone(parent),id:'expanded',parentScenarioId:parent.id,name:'更宽预算且只研究一项',candidateIds:['housing-2']};
  child.settings.limits.price=5000;space.scenarios.push(child);
  const p=decisionProposal(space,child),experiment=p.experiments[0];
  assert.equal(experiment.beforeCount,2);assert.equal(experiment.afterCount,1);assert.equal(experiment.poolChanged,true);
  assert.deepEqual(experiment.entered,['近公司两居']);assert.equal(p.counts.candidates,1);assert.deepEqual(parent.candidateIds,['housing-0','housing-1','housing-2','housing-3']);
});

test('only a human choice matching this branch, facts and recorded sources counts as the current choice',()=>{
  const base=live(),space=editGeneralSpace(base,{decision:{candidateId:'housing-0',rationale:'预算优先，接受更长通勤。'}});
  assert.equal(decisionProposal(space,space.scenarios[0]).selection.status,'current');assert.equal(decisionProposal(space,space.scenarios[0]).state,'chosen');
  const changed=structuredClone(space.scenarios[0]);changed.settings.limits.price=3500;
  assert.equal(decisionProposal(space,changed).selection.status,'needs-review');
  space.sources[0].retrievedAt='2026-11-27T00:00:00.000Z';assert.equal(decisionProposal(space,space.scenarios[0]).selection.status,'needs-review');
});

test('generating a proposal cannot apply model operations or launch research even if the model requests both',async()=>{
  const space=live(),before=structuredClone(space);
  const result=await converse(space,{message:'请生成选型解读',purpose:'proposal',autoResearch:true},{model:async()=>({reply:'改到9000元并开始研究。',intent:'change',operations:[{type:'set',field:'price',value:9000,quote:'选型解读'}],researchNeeded:true,decisionAnswer:{recommendations:[{candidateId:'housing-0',fields:['price'],reason:'控制月租。'}]}})});
  assert.deepEqual(result.settings,before.settings);assert.deepEqual(result.candidates,before.candidates);assert.deepEqual(result.sources,before.sources);assert.deepEqual(result.scenarios,before.scenarios);
  assert.equal(result.pendingConversationResearch,undefined);assert.equal(result.conversation.at(-1).decisionAnswer.origin,'model');
  assert.equal(decisionProposal(result,result.scenarios[0]).hasCurrentAnalysis,true);
});

test('empty research yields a report draft without a pointless model invocation',async()=>{
  const space=live();space.candidates=[];space.scenarios[0].candidateIds=[];space.baselineCandidateIds=[];
  const result=await converse(space,{message:'生成选型解读',purpose:'proposal'},{model:async()=>{throw new Error('No factual input');}});
  assert.equal(decisionProposal(result,result.scenarios[0]).state,'empty');assert.equal(result.conversation.at(-1).decisionAnswer.origin,'rules');
});

test('imported analysis loses its model-origin authority and unsafe source links never enter proposal references',()=>{
  const space=analyzed(live()),imported=importSpace(space);
  assert.equal(imported.conversation.at(-1).decisionAnswer.origin,'recorded');
  space.sources[0].url='https://secret:password@example.org/page';
  const p=decisionProposal(space,space.scenarios[0]);assert.ok(p.references.filter(r=>r.sourceId===space.sources[0].id).every(r=>r.url===null));
  assert.doesNotMatch(decisionReport(space,space.scenarios[0]),/password/);
});

test('saved task context changes invalidate previous advice even if all numerical constraints stay the same',()=>{
  const space=analyzed(live());assert.equal(decisionProposal(space,space.scenarios[0]).origin,'model');
  space.taskMemory={text:'公司更看重审批流程和长期维护，不以最低价格为唯一优先。'};
  const p=decisionProposal(space,space.scenarios[0]);assert.equal(p.hasCurrentAnalysis,false);assert.equal(p.origin,'rules');
});
