import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {completeFixture} from './browser/complete-space.fixture.mjs';
import {mergeScenarioResearch,prepareScenario,scenarioQuestion} from '../src/scenario-research.mjs';
import {scenarioCandidates,analyzeScenario} from '../src/scenarios.mjs';
import {editSpace} from '../src/space-edits.mjs';
import {Store} from '../src/store.mjs';
import {createApp} from '../src/server.mjs';

function branch(space){return {id:'expanded-budget',name:'预算增加到 8000 元',settings:{...structuredClone(space.settings),budget:8000}};}
function incoming(){
  const research=completeFixture();
  research.candidates=research.candidates.slice(0,1);
  const c=research.candidates[0];c.id='new-product';c.name='新方案 fixture';
  c.productData.sourceProductUrl='https://m.suning.com/product/000/999.html';
  c.productData.identity.platformProductId='999';
  return research;
}
test('new discoveries belong to one branch; baseline, sibling pools and evidence remain intact after saving',()=>{
  const original=completeFixture(),snapshot=structuredClone(original),b=branch(original);
  const raw=[...original.scenarios,b];
  const result=mergeScenarioResearch(original,incoming(),{id:'12345678-job',scenarios:raw,scenarioId:b.id,events:[{type:'search',message:'actual query'}]});
  const current=result.scenarios.find(s=>s.id===b.id),baseline=result.scenarios[0];
  assert.equal(scenarioCandidates(result,current).length,3);
  assert.equal(scenarioCandidates(result,baseline).length,2);
  assert.equal(scenarioCandidates(result,result.scenarios[1]).length,2);
  assert.equal(analyzeScenario(result,current).before.length,2);
  assert.equal(current.research.addedIds.length,1);
  const added=result.candidates.at(-1);
  for(const f of Object.values(added.productData.fields))assert.ok(result.sources.find(s=>s.id===f.sourceId)?.text.includes(f.quote));
  assert.deepEqual(original,snapshot);
  const restored=editSpace(result,{settings:current.settings,scenarios:result.scenarios});
  assert.deepEqual(restored.scenarios.at(-1).research,current.research);
  assert.equal(scenarioCandidates(restored,restored.scenarios[0]).length,2);
  const forged=structuredClone(result.scenarios);forged[0].candidateIds=result.candidates.map(c=>c.id);forged[0].research={summary:'fake'};
  assert.equal(prepareScenario(result,forged,baseline.id).scenarios[0].candidateIds.length,2);
  assert.equal(prepareScenario(result,forged,baseline.id).scenarios[0].research,undefined);
});
test('incomplete discoveries cannot become placeholder cards or remove the original pool',()=>{
  const p=completeFixture(),b=branch(p),r=incoming();delete r.candidates[0].productData;
  const next=mergeScenarioResearch(p,r,{id:'12345678-job',scenarios:[...p.scenarios,b],scenarioId:b.id,events:[]});
  assert.equal(next.candidates.length,2);assert.equal(next.scenarios.at(-1).research.rejected.length,1);
  assert.match(next.scenarios.at(-1).research.summary,/没有取得/);
});
test('scenario API actually runs discovery, persists a branch result, and resumes failed searches',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'prism-scenario-'));
  const p=await new Store(directory).save(completeFixture());
  let fail=true,modelCalls=0;
  const queries=[];const name='ThinkBook 14 Test (32GB/512GB)';
  const url='https://m.suning.com/product/000/777.html';
  const spec=`# ${name}\nCPU型号Core 5 210H\n内存容量32GB\n硬盘容量512GB\n净重1.4千克\n操作系统Windows 11\n屏幕分辨率1920×1200`;
  const app=createApp({directory,env:{},io:{
    async search(query){queries.push(query);if(fail)throw Error('test network interruption');return [{url,title:name,raw_content:spec}];},
    async model(messages){modelCalls++;assert.match(messages[1].content,/预算不超过8000元/);return {action:'finish',candidates:[{name,facts:{}}],settings:p.settings};},
    async readMerchantOffer(){return {status:'observed',kind:'merchant-listed',value:7699,quote:'¥7699.00',configuration:name,retrievedAt:new Date().toISOString(),snapshot:{url,title:name,text:'Fixture price ¥7699.00'}};},
  }});
  app.listen(0,'127.0.0.1');await once(app,'listening');
  t.after(async()=>{await app.shutdown();await rm(directory,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+app.address().port;
  const post=async(path,body={})=>{const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r.json();};
  const b=branch(p),job=await post(`/api/spaces/${p.id}/explore`,{scenarios:[...p.scenarios,b],scenarioId:b.id});
  const wait=async()=>{for(let i=0;i<300;i++){const j=await(await fetch(base+'/api/jobs/'+job.id)).json();if(j.status!=='running')return j;await new Promise(r=>setTimeout(r,20));}throw Error('timeout');};
  assert.equal((await wait()).status,'failed');assert.equal(modelCalls,0);
  fail=false;await post('/api/jobs/'+job.id+'/resume');
  const done=await wait();assert.equal(done.status,'complete',done.error);
  assert.equal(modelCalls,1);assert.match(queries[0],/7000-8000元/);
  const saved=await(await fetch(base+'/api/spaces/'+done.spaceId)).json();
  assert.equal(saved.rootId,p.id);assert.equal(saved.activeScenarioId,b.id);
  assert.equal(saved.candidates.length,3);assert.equal(saved.scenarios.at(-1).research.addedIds.length,1);
  assert.equal(scenarioCandidates(saved,saved.scenarios[0]).length,2);
  assert.equal(saved.scenarios.at(-1).research.events.some(e=>e.type==='search'),true);
  assert.equal((await new Store(directory).get(p.id)).candidates.length,2);
});
