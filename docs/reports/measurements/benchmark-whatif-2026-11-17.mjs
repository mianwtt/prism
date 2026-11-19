// Controlled synthetic measurement of the production computation core, not UI or research.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {cpus} from 'node:os';
import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {validateDecisionSchema,decisionScenarios,changeScenarioSettings,evaluateDecision}=await import(pathToFileURL(resolve('src/decision-schema.mjs')).href);

const schema=validateDecisionSchema({fields:[
 {key:'price',label:'价格',unit:'元',direction:-1},
 {key:'memory',label:'内存',unit:'GB',direction:1},
 {key:'weight',label:'重量',unit:'kg',direction:-1},
]});
const baseline={limits:{price:7000,memory:16,weight:2},weights:{price:40,memory:30,weight:30}};
function makeSpace(count){
 let state=20261117;
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
 const candidates=Array.from({length:count},(_,i)=>({id:'synthetic-'+i,name:'Synthetic '+i,
  facts:Object.fromEntries(Object.entries({price:2000+Math.floor(random()*7001),memory:[16,24,32,48][Math.floor(random()*4)],weight:1.1+Math.floor(random()*16)/10}).map(([key,value])=>[key,{value,status:'cited'}]))}));
 const branch=(id,parent,changes)=>({id,parentScenarioId:parent,name:id,settings:{limits:{...baseline.limits,...changes},weights:{...baseline.weights}},candidateIds:candidates.map(c=>c.id)});
 return {schema,candidates,settings:baseline,baselineSettings:structuredClone(baseline),scenarios:[
  branch('expanded','scenario-baseline',{price:8000}),branch('budget','expanded',{price:5000}),
  branch('light','budget',{price:5000,weight:1.7}),branch('memory','expanded',{price:8000,memory:24}),
  branch('recovery','memory',{price:8000,memory:24,weight:1.5}),branch('independent','scenario-baseline',{price:6000}),
 ]};
}
const quantile=(xs,q)=>[...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*q)-1];
const results=[];
for(const count of [9,100,1000]){
 const space=makeSpace(count);let tree=decisionScenarios(space),checks=0;
 const original=JSON.stringify(tree.filter(s=>['scenario-baseline','independent'].includes(s.id)));
 const byId=new Map(space.candidates.map(c=>[c.id,c]));
 const run=(index,validate)=>{
  const settings=structuredClone(tree.find(s=>s.id==='expanded').settings);settings.limits.memory=[16,24,32,48][index%4];
  const start=performance.now();
  tree=changeScenarioSettings(tree,'expanded',settings,schema).scenarios;
  const rankings=tree.map(s=>evaluateDecision(s.candidateIds.map(id=>byId.get(id)),s.settings,schema));
  const elapsed=performance.now()-start;
  if(validate){
   assert.equal(JSON.stringify(tree.filter(s=>['scenario-baseline','independent'].includes(s.id))),original);
   assert.equal(tree.find(s=>s.id==='budget').settings.limits.memory,settings.limits.memory);
   assert.equal(tree.find(s=>s.id==='light').settings.limits.memory,settings.limits.memory);
   assert.equal(tree.find(s=>s.id==='memory').settings.limits.memory,24);
   assert.equal(tree.find(s=>s.id==='recovery').settings.limits.memory,24);
   for(let i=0;i<tree.length;i++){
    const limits=tree[i].settings.limits;
    // Independent eligibility oracle: does not call production evaluation or inheritance.
    const expected=space.candidates.filter(c=>c.facts.price.value<=limits.price&&c.facts.memory.value>=limits.memory&&c.facts.weight.value<=limits.weight).map(c=>c.id).sort();
    assert.deepEqual(rankings[i].filter(r=>r.status==='eligible').map(r=>r.id).sort(),expected);
    checks++;
   }
  }
  return elapsed;
 };
 for(let i=0;i<80;i++)run(i,false);
 const rounds=[],all=[];
 for(let round=0;round<5;round++){
  const times=[];
  for(let i=0;i<200;i++)times.push(run(i,true));
  all.push(...times);rounds.push({round:round+1,p50Ms:quantile(times,.5),p95Ms:quantile(times,.95),maxMs:Math.max(...times)});
 }
 results.push({candidates:count,fields:3,scenariosIncludingBaseline:7,measuredChanges:all.length,independentEligibilityChecks:checks,
  p50Ms:quantile(all,.5),p95Ms:quantile(all,.95),maxMs:Math.max(...all),rounds});
}
const output={kind:'controlled-synthetic-whatif-core-measurement',date:'2026-11-17',
 sourceCommit:'0aa305f03ceab83815d5d82da4da7e6c997e7e6d',
 environment:{node:process.version,platform:process.platform,arch:process.arch,cpuModel:cpus()[0]?.model},
 method:{seed:20261117,warmupChangesPerSize:80,rounds:5,changesPerRound:200,
  timed:'inheritance change, candidate-scope mapping, evaluating and sorting all 7 scenarios',
  excluded:'fixture construction, independent assertions, DOM/SVG/layout/paint, persistence, model inference, search and network',
  limitations:'One host, synthetic complete fields, fixed 3-field/7-scenario shape. No browser SLA or superiority over a measured LLM baseline.'},results};
await mkdir('work/benefit-evaluation',{recursive:true});
await writeFile('work/benefit-evaluation/whatif-core-2026-11-17.json',JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
