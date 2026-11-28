import test from 'node:test';
import assert from 'node:assert/strict';
import {housingDemo} from '../src/general-space.mjs';
import {decisionGuidance} from '../src/decision-guidance.mjs';
import {evaluateDecision,validateDecisionSchema,validateDecisionSettings} from '../src/decision-schema.mjs';
import {prepareDecisionInvestigation,mergeFocusedEvidence,matchesResearchFocus} from '../src/decision-investigation.mjs';

function live(){const s=housingDemo();s.mode='live';for(const c of s.candidates)for(const f of Object.values(c.facts))f.status='cited';for(const source of s.sources){source.kind='page';source.url='https://example.org/software-fixture/'+source.id;}return s;}
function missing(s,id,key){s.candidates.find(c=>c.id===id).facts[key]={value:null,status:'unknown',sourceId:null,quote:''};}

test('suggestions derive exact evidence thresholds, simulate their effects and preserve all original data',()=>{
  const s=housingDemo(),selected=s.scenarios[0],before=structuredClone(s);
  const guidance=decisionGuidance(s,selected,{limit:20});
  const budget=guidance.suggestions.find(p=>p.changes.some(c=>c.field==='price'&&c.value===4600));
  assert.ok(budget);assert.equal(budget.beforeCount,2);assert.equal(budget.afterCount,3);
  assert.deepEqual(budget.entered,[{id:'housing-2',name:'近公司两居'}]);
  assert.match(budget.changes[0].quote,/4600/);
  for(const p of guidance.suggestions){
    const after=evaluateDecision(s.candidates,p.settings,s.schema).filter(r=>r.status==='eligible');
    assert.equal(after.length,p.afterCount);
    for(const f of s.schema.fields)if(!p.changes.some(c=>c.field===f.key))assert.equal(p.settings.limits[f.key],selected.settings.limits[f.key]);
    assert.deepEqual(p.settings.weights,selected.settings.weights);
  }
  assert.deepEqual(s,before);
});

test('a candidate blocked by two constraints receives the exact paired adjustment, never a silent baseline edit',()=>{
  const s=housingDemo(),selected=structuredClone(s.scenarios[0]);selected.settings.limits.area=60;
  const p=decisionGuidance(s,selected,{limit:20}).suggestions.find(p=>p.targetCandidateId==='housing-2');
  assert.ok(p);assert.equal(p.changes.length,2);
  assert.deepEqual(p.settings.limits,{price:4600,area:58,commute:45});
  assert.equal(selected.settings.limits.area,60);
});

test('guidance never widens branch scope, uses paused options, or treats a fabricated quote as threshold evidence',()=>{
  const s=live(),selected={...s.scenarios[0],candidateIds:['housing-0','housing-2']};
  s.candidates[2].enabled=false;
  assert.equal(decisionGuidance(s,selected).candidateCount,1);
  assert.equal(decisionGuidance(s,selected).suggestions.length,0);
  s.candidates[2].enabled=true;s.candidates[2].facts.price.quote='虚构价格100元';
  const guide=decisionGuidance(s,selected);
  assert.ok(!guide.suggestions.some(p=>p.changes.some(c=>c.candidateName==='近公司两居')));
  assert.ok(guide.investigations.some(t=>t.candidateId==='housing-2'));
});

test('investigation prioritizes a blocking unknown and skips a gap in an already disqualified candidate',()=>{
  const s=live();missing(s,'housing-0','commute');missing(s,'housing-2','commute');
  const tasks=decisionGuidance(s,s.scenarios[0]).investigations;
  assert.equal(tasks[0].candidateId,'housing-0');assert.deepEqual(tasks[0].fieldKeys,['commute']);
  assert.equal(tasks[0].hardConditions,1);assert.ok(!tasks.some(t=>t.candidateId==='housing-2'));
  const prepared=prepareDecisionInvestigation(s,{scenarioId:'scenario-baseline',investigationId:tasks[0].id,fieldKeys:['price'],scenarios:s.scenarios});
  assert.deepEqual(prepared.focus.fieldKeys,['commute']);
  assert.deepEqual(prepared.scenario.settings,s.settings);
  assert.throws(()=>prepareDecisionInvestigation(s,{scenarioId:'missing',investigationId:tasks[0].id}),/分支/);
  assert.throws(()=>prepareDecisionInvestigation(housingDemo(),{}),/演示/);
});

test('ranking-only unknowns with an upper bound below the current best are not promoted as decisive gaps',()=>{
  const schema=validateDecisionSchema({fields:[{key:'cost',label:'费用',direction:-1},{key:'quality',label:'质量',direction:1,range:{min:0,max:100}}]});
  const source={id:'s',text:'甲费用100元质量100。乙费用200元。',kind:'page',url:'https://example.org/fixture'};
  const s={schema,mode:'live',sources:[source],candidates:[{id:'a',name:'甲',facts:{cost:{value:100,status:'cited',sourceId:'s',quote:'费用100元'},quality:{value:100,status:'cited',sourceId:'s',quote:'质量100'}}},{id:'b',name:'乙',facts:{cost:{value:200,status:'cited',sourceId:'s',quote:'费用200元'},quality:{value:null,status:'unknown'}}}]};
  const selected={candidateIds:['a','b'],settings:validateDecisionSettings({weights:{cost:100,quality:1}},schema)};
  assert.equal(decisionGuidance(s,selected).investigations.length,0);
});

test('review-only evidence is routed to human citation confirmation, not another web research run',()=>{
  const s=live(),selected={...s.scenarios[0],settings:{...s.settings,evidenceMode:'reviewed'}};
  const tasks=decisionGuidance(s,selected).investigations;
  assert.ok(tasks.length);assert.ok(tasks.every(t=>t.kind==='review'));
  assert.throws(()=>prepareDecisionInvestigation(s,{scenarios:[selected],scenarioId:selected.id,investigationId:tasks[0].id}),/确认|已变化/);
});

test('focused evidence merges only requested fields, preserves conflicts, and requires a matching entity',()=>{
  const s=live(),original=s.candidates[0];missing(s,original.id,'commute');
  const task=decisionGuidance(s,s.scenarios[0]).investigations[0];
  const {focus}=prepareDecisionInvestigation(s,{scenarioId:'scenario-baseline',investigationId:task.id});
  const source={id:'fresh',url:focus.sourceUrls[0],title:original.name,text:'沿河一居 单程通勤35分钟，月租100元。',kind:'page'};
  const incoming={...structuredClone(original),sourceId:source.id,facts:{commute:{value:35,status:'cited',quote:'通勤35分钟',sourceId:'fresh'},price:{value:100,status:'cited',quote:'月租100元',sourceId:'fresh'}}};
  assert.equal(matchesResearchFocus(incoming,[source],focus),true);
  assert.equal(matchesResearchFocus({...incoming,name:'另一套房'},[source],focus),false);
  const merged=mergeFocusedEvidence(original,incoming,[...s.sources,source],s.schema,focus);
  assert.equal(merged.facts.commute.value,35);assert.equal(merged.facts.price.value,3200);
  assert.equal(original.facts.commute.value,null);assert.notEqual(merged.id,original.id);
  const conflict=mergeFocusedEvidence({...original,facts:{...original.facts,commute:{value:42,status:'cited',sourceId:s.sources[0].id,quote:s.sources[0].text}}},incoming,[...s.sources,source],s.schema,focus);
  assert.equal(conflict.facts.commute.value,null);assert.equal(conflict.facts.commute.conflictingEvidence.length,2);
});
