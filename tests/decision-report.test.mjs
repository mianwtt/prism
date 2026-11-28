import test from 'node:test';
import assert from 'node:assert/strict';
import {housingDemo} from '../src/general-space.mjs';
import {decisionReport} from '../src/decision-report.mjs';
import {editSpace} from '../src/space-edits.mjs';

test('decision brief uses the active scope and exposes gaps without inventing a recommendation',()=>{
  const space=housingDemo(),selected=structuredClone(space.scenarios[0]);
  selected.candidateIds=[space.candidates[0].id];
  space.candidates[0].facts.price={value:null,status:'unknown',quote:''};
  const before=structuredClone(space),report=decisionReport(space,selected);
  assert.match(report,/已收集 1 个方案/);
  assert.match(report,/价格|月租/);
  assert.match(report,/待核对/);
  assert.match(report,/尚未记录最终选择/);
  assert.match(report,/虚构演示/);
  assert.ok(!report.includes(space.candidates[1].name));
  assert.deepEqual(space,before);
});

test('model analysis is used only for matching branch conditions and saved choices stay historical',()=>{
  const space=editSpace(housingDemo(),{decision:{candidateId:'housing-1',rationale:'我愿意为了通勤接受更高的房租。'}});
  const selected=space.scenarios[0];
  space.analysis={scenarioId:selected.id,settingsKey:JSON.stringify(selected.settings),summary:'当前条件下的模型取舍分析。'};
  const report=decisionReport(space,selected);
  assert.match(report,/当前条件下的模型取舍分析/);
  assert.match(report,/记录时的判断/);
  assert.match(report,/我愿意为了通勤/);
  const changed=structuredClone(selected);changed.settings.limits.price=2000;
  assert.ok(!decisionReport(space,changed).includes(space.analysis.summary));
  assert.ok(!decisionReport(space,{...selected,id:'different-branch'}).includes(space.analysis.summary));
});

test('only matching saved quotations become citations and source URLs exclude credentials and unsafe schemes',()=>{
  const space=housingDemo(),candidate=space.candidates[0],source=space.sources.find(item=>item.id===candidate.facts.price.sourceId);
  space.mode='live';
  for(const fact of Object.values(candidate.facts))fact.status='cited';
  const selected={...space.scenarios[0],candidateIds:[candidate.id]};
  const original=candidate.facts.price.quote;
  assert.ok(decisionReport(space,selected).includes(original));
  candidate.facts.price.quote='不存在于来源中的虚构报价';
  assert.ok(!decisionReport(space,selected).includes(candidate.facts.price.quote));
  source.url='javascript:alert(1)';
  assert.ok(!decisionReport(space,selected).includes('javascript:'));
  source.url='https://secret:password@example.org/page';
  assert.ok(!decisionReport(space,selected).includes('password'));
});

test('branch brief recalculates current unsaved conditions and reports parent-to-child movements',()=>{
  const space=housingDemo(),parent=space.scenarios[0];
  const selected={...structuredClone(parent),id:'test-branch',name:'更低预算',parentScenarioId:parent.id};
  selected.settings.limits.price=1000;
  const report=decisionReport({...space,scenarios:[parent,selected]},selected,{hasUnsavedChanges:true});
  assert.match(report,/与父分支的变化/);
  assert.match(report,/其中 0 个符合当前条件/);
  assert.match(report,/不再符合条件：\S/);
  assert.match(report,/1,000/);
  assert.match(report,/画布草稿，尚未另存/);
  assert.notEqual(parent.settings.limits.price,1000);
});
