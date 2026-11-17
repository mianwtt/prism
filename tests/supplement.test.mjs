import test from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {demoSpace} from "../src/demo.mjs";
import {Store} from "../src/store.mjs";
import {createApp} from "../src/server.mjs";
import {mergeSupplement,supplementQueries} from "../src/supplement.mjs";

test("supplementing preserves assumptions/settings, namespaces citations and keeps distinct configurations apart",()=>{
  const previous=demoSpace();previous.mode="live";
  previous.candidates=[previous.candidates[0]];
  previous.candidates[0].facts.memory.confirmation="user-assumption";
  const incoming=structuredClone(previous);
  incoming.candidates[0].facts.memory.value=16;
  incoming.candidates[0].facts.weight={value:1.3,sourceId:"source-atlas",quote:"Body weight 1.3 kg.",status:"unreviewed"};
  const original=structuredClone(previous);
  const result=mergeSupplement(previous,incoming,"12345678-example");
  assert.deepEqual(result.settings,previous.settings);
  assert.equal(result.candidates[0].facts.memory.value,32);
  assert.equal(result.candidates[0].facts.weight.value,null);
  assert.match(result.candidates[0].facts.weight.conflictingEvidence[1].sourceId,/research-12345678/);
  assert.ok(result.sources.some(s=>s.id==="research-12345678-source-atlas"));
  assert.deepEqual(previous,original);
  previous.candidates[0].proposedName="SameBook (Ultra5/16GB)";
  incoming.candidates[0].name="SameBook";incoming.candidates[0].proposedName="SameBook (Ultra7/32GB)";
  assert.equal(mergeSupplement(previous,incoming,"12345678-example").candidates.length,2);
  assert.equal(supplementQueries(original).length,1);
});

test("supplement HTTP job searches every existing target and saves a linked version without planner drift",async(t)=>{
  const basePrefix=join(tmpdir(),"prism-supplement-"),directory=await mkdtemp(basePrefix);
  const initial=demoSpace();initial.mode="live";initial.candidates=[initial.candidates[0]];
  initial.candidates[0].name="FixtureBook 14";
  initial.candidates[0].facts.price={value:null,status:"unknown",sourceId:null,quote:""};
  initial.candidates[0].facts.memory.confirmation="user-assumption";
  const saved=await new Store(directory).save(initial), queries=[];
  const text="FixtureBook 14 exact configuration: price 6999 CNY; memory 16 GB; weight 1.42 kg.";
  const server=createApp({directory,env:{},io:{
    model:async()=>assert.fail("targeted supplementation must not ask the planner to reinvent candidates"),
    search:async query=>{queries.push(query);return[{title:"FixtureBook 14 官方配置",url:"https://example.com/sku",raw_content:text}];},
    extractFacts:async()=>({facts:{price:{value:6999,sourceId:"s1",quote:text},memory:{value:16,sourceId:"s1",quote:text}}}),
  }});
  server.listen(0,"127.0.0.1");await once(server,"listening");
  t.after(async()=>{await server.shutdown();await new Promise(r=>server.close(r));assert.ok(resolve(directory).startsWith(resolve(basePrefix)));await rm(directory,{recursive:true,force:true});});
  const base="http://127.0.0.1:"+server.address().port;
  const response=await fetch(base+"/api/spaces/"+saved.id+"/research",{method:"POST"});
  assert.equal(response.status,202);const job=await response.json();
  let status;
  for(let i=0;i<200;i++){status=await(await fetch(base+"/api/jobs/"+job.id)).json();if(status.status!=="running")break;await new Promise(r=>setTimeout(r,15));}
  assert.equal(status.status,"complete",status.error);
  const result=await(await fetch(base+"/api/spaces/"+status.spaceId)).json();
  assert.equal(result.parentId,saved.id);assert.equal(result.version,2);assert.equal(queries.length,1);
  assert.equal(result.candidates[0].facts.price.value,6999);assert.equal(result.candidates[0].facts.memory.value,32);
  assert.ok(result.sources.some(s=>s.id===result.candidates[0].facts.price.sourceId));
});
