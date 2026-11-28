import test from 'node:test';
import assert from 'node:assert/strict';
import {focusedService} from './helpers/focused-service.mjs';
import {evaluateDecision} from '../src/decision-schema.mjs';

test('focused HTTP research runs specialists, rereads the saved page, and updates only the requested fact in a child',async()=>{
  const service=await focusedService();try{
    const before=structuredClone(service.space),reply=await service.post('/api/spaces/'+before.id+'/investigate',{scenarioId:'scenario-baseline',investigationId:'check-housing-0',fieldKeys:['price']});
    assert.equal(reply.status,202);assert.deepEqual(reply.body.researchFocus.fieldKeys,['commute']);
    const after=await service.complete(reply.body.id),child=after.scenarios.find(s=>s.id===after.activeScenarioId);
    assert.notEqual(child.id,'scenario-baseline');assert.equal(child.parentScenarioId,'scenario-baseline');
    assert.deepEqual(child.settings,before.scenarios[0].settings);assert.deepEqual(after.schema,before.schema);
    assert.deepEqual(after.candidates.find(c=>c.id==='housing-0'),before.candidates[0]);
    const updated=after.candidates.find(c=>c.id===child.research.focus.updatedCandidateId);
    assert.equal(updated.facts.commute.value,35);assert.equal(updated.facts.price.value,3200);assert.equal(updated.facts.area.value,32);
    assert.ok(!child.candidateIds.includes('housing-0'));assert.ok(child.candidateIds.includes(updated.id));
    assert.deepEqual(after.scenarios[0].candidateIds,before.scenarios[0].candidateIds);
    assert.equal(after.candidates.some(c=>c.name==='无关候选'),false);
    assert.equal(child.research.focus.status,'evidence-found');assert.deepEqual(child.research.focus.resolvedFields,['commute']);
    assert.ok(service.calls.read.includes(before.sources[0].url));assert.equal(service.calls.search.length,1);
    assert.ok(service.calls.prompts.some(p=>p.startsWith('Independently review')));
    assert.ok(after.agent.runs.filter(run=>run.role==='researcher').every(run=>run.skills.some(skill=>skill.name==='rental-research')));
    assert.equal(evaluateDecision(after.candidates.filter(c=>child.candidateIds.includes(c.id)),child.settings,after.schema).filter(r=>r.status==='eligible').length,2);
    assert.deepEqual(await service.get('/api/spaces/'+before.id),before);
  }finally{await service.close();}
});

test('an unrelated entity cannot fill a missing fact, and incomplete research reports the unresolved gap',async()=>{
  const service=await focusedService({wrongEntity:true});try{
    const reply=await service.post('/api/spaces/'+service.space.id+'/investigate',{scenarioId:'scenario-baseline',investigationId:'check-housing-0'});
    const after=await service.complete(reply.body.id),child=after.scenarios.find(s=>s.id===after.activeScenarioId);
    assert.equal(after.candidates.length,service.space.candidates.length);
    assert.equal(child.research.focus.status,'needs-evidence');assert.equal(after.candidates[0].facts.commute.value,null);
    assert.ok(child.candidateIds.includes('housing-0'));
  }finally{await service.close();}
});

test('investigation endpoint rejects stale tasks, absent branches and demonstration data',async()=>{
  const service=await focusedService();try{
    const endpoint='/api/spaces/'+service.space.id+'/investigate';
    assert.equal((await service.post(endpoint,{scenarioId:'scenario-baseline',investigationId:'check-housing-2'})).status,409);
    assert.equal((await service.post(endpoint,{scenarioId:'absent',investigationId:'check-housing-0'})).status,400);
    const demo=await service.post('/api/spaces/demo/housing',{});
    assert.equal((await service.post('/api/spaces/'+demo.body.id+'/investigate',{scenarioId:'scenario-baseline',investigationId:'check-housing-0'})).status,400);
    assert.equal(service.calls.search.length,0);
  }finally{await service.close();}
});
