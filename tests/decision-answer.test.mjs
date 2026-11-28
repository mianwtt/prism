import test from 'node:test';
import assert from 'node:assert/strict';
import {housingDemo} from '../src/general-space.mjs';
import {buildDecisionAnswer,decisionAnswerContext,decisionBasisKey} from '../src/decision-answer.mjs';
import {converse} from '../src/conversation.mjs';
import {importSpace} from '../src/space-import.mjs';

function live(){const s=housingDemo();s.mode='live';for(const source of s.sources){source.kind='page';source.url='https://example.org/software-fixture/'+source.id;}for(const c of s.candidates)for(const fact of Object.values(c.facts))fact.status='cited';return s;}

test('recommendation gate rejects excluded, disabled, absent and out-of-branch candidates',()=>{
  const space=live(),branch=structuredClone(space.scenarios[0]);branch.candidateIds=['housing-0','housing-1','housing-2'];space.candidates[1].enabled=false;
  const result=buildDecisionAnswer({recommendations:['housing-2','housing-1','absent','housing-3'].map(candidateId=>({candidateId,fields:['price'],reason:'无依据的推荐'}))},space,branch);
  assert.equal(result.rejectedSuggestions,4);assert.deepEqual(result.recommendations.map(r=>r.candidateId),['housing-0']);
  assert.equal(space.scenarios.length,1);
});

test('model field selection is checked and unsupported numerical claims are replaced with a factual comparison',()=>{
  const space=live(),answer=buildDecisionAnswer({recommendations:[{candidateId:'housing-0',fields:['price','fake'],reason:'仅需999元，免费通勤。',quote:'模型伪造引文'}]},space,space.scenarios[0]);
  assert.deepEqual(answer.recommendations[0].fields,['price']);assert.doesNotMatch(answer.recommendations[0].reason,/999/);
  assert.equal(JSON.stringify(answer).includes('模型伪造引文'),false);
});

test('verified answer context withholds a fact whose saved quotation does not support it',()=>{
  const space=live();space.candidates[0].facts.price.quote='不存在的引用';
  const context=decisionAnswerContext(space,space.scenarios[0]);
  assert.equal(context.candidates.find(c=>c.id==='housing-0').status,'unresolved');
  assert.equal(context.candidates.find(c=>c.id==='housing-0').evidence.some(e=>e.field==='price'),false);
  assert.ok(!buildDecisionAnswer(null,space,space.scenarios[0]).recommendations.some(r=>r.candidateId==='housing-0'));
});

test('all unresolved or disqualified options yield gaps instead of a forced recommendation',()=>{
  const space=live();space.candidates[0].facts.commute={value:null,status:'unknown'};space.candidates[1].facts.commute={value:null,status:'unknown'};
  const answer=buildDecisionAnswer(null,space,space.scenarios[0]);
  assert.deepEqual(answer.recommendations,[]);assert.equal(answer.gaps.length,2);assert.match(answer.summary,/依据不足/);
});

test('advice freshness follows its facts and settings, while unrelated source additions do not invalidate it',()=>{
  const space=live(),branch=space.scenarios[0],key=decisionBasisKey(space,branch);
  space.sources.push({id:'unrelated',text:'unrelated'});assert.equal(decisionBasisKey(space,branch),key);
  space.sources[0].text+=' 新资料';assert.notEqual(decisionBasisKey(space,branch),key);
  const before=decisionBasisKey(space,branch);branch.settings.limits.price=5000;assert.notEqual(decisionBasisKey(space,branch),before);
});

test('live conversation supplies checked evidence, persists bound advice and never accepts a model rewrite of eligibility',async()=>{
  const space=live(),before=structuredClone(space);let payload;
  const next=await converse(space,{message:'帮我比较方案取舍'}, {model:async messages=>{payload=JSON.parse(messages[1].content);return {reply:'应选择近公司两居，它肯定符合预算。',intent:'explain',decisionAnswer:{recommendations:[{candidateId:'housing-2',fields:['price'],reason:'最合适'}]}};}});
  assert.ok(payload.decisionContext.candidates[0].evidence.length);
  assert.equal(next.conversation.at(-1).decisionAnswer.rejectedSuggestions,1);
  assert.ok(!next.conversation.at(-1).decisionAnswer.recommendations.some(r=>r.candidateId==='housing-2'));
  assert.doesNotMatch(next.conversation.at(-1).content,/它肯定符合预算/);
  assert.deepEqual(next.candidates,before.candidates);assert.deepEqual(next.scenarios,before.scenarios);assert.deepEqual(space,before);
});

test('evidence follow-up uses deterministic gaps and exported advice retains references without authority',async()=>{
  const space=live();space.candidates[0].facts.commute={value:null,status:'unknown'};
  const next=await converse(space,{message:'下一步最值得核对什么？'},{model:async()=>{throw new Error('No model needed for known gaps');}});
  assert.equal(next.conversation.at(-1).decisionAnswer.gaps[0].candidateId,'housing-0');
  const imported=importSpace(next);assert.deepEqual(imported.conversation.at(-1).decisionAnswer.gaps,next.conversation.at(-1).decisionAnswer.gaps);
  const invalid=structuredClone(next);invalid.conversation.at(-1).decisionAnswer.recommendations[0].candidateId='absent';
  assert.throws(()=>importSpace(invalid),/不存在/);
});

test('review-only mode cannot produce an advice citation from unconfirmed evidence',()=>{
  const space=live(),branch={...space.scenarios[0],settings:{...space.settings,evidenceMode:'reviewed'}};
  const answer=buildDecisionAnswer(null,space,branch);assert.deepEqual(answer.recommendations,[]);
  assert.ok(decisionAnswerContext(space,branch).candidates.every(c=>c.evidence.length===0));
});

test('a dominated option remains on the canvas but is not promoted in a broad recommendation',()=>{
  const space=live(),branch=space.scenarios[0];
  const clone=structuredClone(space.candidates[1]);clone.id='worse';clone.name='相同条件下更贵的方案';
  const source={id:'worse-source',kind:'page',url:'https://example.org/software-fixture/worse',text:'月租 3950 元/月，面积 40 ㎡，单程通勤 25 分钟。'};
  clone.sourceId=source.id;for(const fact of Object.values(clone.facts)){fact.sourceId=source.id;fact.quote=source.text;}clone.facts.price.value=3950;
  space.sources.push(source);space.candidates.push(clone);branch.candidateIds.push(clone.id);
  const context=decisionAnswerContext(space,branch).candidates.find(c=>c.id===clone.id);
  assert.equal(context.status,'eligible');assert.deepEqual(context.dominatedBy,['housing-1']);
  const answer=buildDecisionAnswer({recommendations:[{candidateId:clone.id,fields:['price'],reason:'优先选择'}]},space,branch);
  assert.equal(answer.rejectedSuggestions,1);assert.ok(answer.recommendations.every(r=>r.candidateId!==clone.id));
  assert.ok(branch.candidateIds.includes(clone.id));
});

test('a grounded cross-option comparison and the actual user limit are allowed in model interpretation',()=>{
  const space=live(),reason='月租3200元低于另一方案3900元，也在4000元预算内。';
  const answer=buildDecisionAnswer({recommendations:[{candidateId:'housing-0',fields:['price'],reason}]},space,space.scenarios[0]);
  assert.equal(answer.recommendations[0].reason,reason);
});

test('a recommendation question containing a hypothetical budget never silently edits the current branch',async()=>{
  const space=housingDemo(),next=await converse(space,{message:'预算5000的情况下应该怎么选？'});
  assert.deepEqual(next.settings,space.settings);assert.equal(next.scenarios.length,space.scenarios.length);
  assert.match(next.conversation.at(-1).content,/这次只作说明/);assert.match(next.conversation.at(-1).content,/5,000/);
});
