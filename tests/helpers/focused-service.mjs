import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../../src/server.mjs';
import {Store} from '../../src/store.mjs';
import {housingDemo} from '../../src/general-space.mjs';

// Deterministic source/model adapters exercise the actual HTTP + specialist graph.
// All names, pages and observations below are software fixtures, not listings.
export async function focusedService({wrongEntity=false,missing=false,delay=0,branch=false}={}){
  const directory=await mkdtemp(join(tmpdir(),'prism-focused-'));
  const fixture=housingDemo();fixture.mode='live';fixture.title='关键依据补查 · 软件测试';
  for(const source of fixture.sources){source.kind='page';source.url='https://example.org/software-fixture/'+source.id;}
  for(const candidate of fixture.candidates)for(const fact of Object.values(candidate.facts))fact.status='cited';
  fixture.candidates[0].facts.commute={value:null,status:'unknown',quote:'',sourceId:null};
  if(branch){const baseline=fixture.scenarios[0];fixture.scenarios.push({...structuredClone(baseline),id:'scenario-other',parentScenarioId:baseline.id,name:'较宽预算',settings:{...structuredClone(baseline.settings),limits:{...baseline.settings.limits,price:4800}}});fixture.canvasScenarioIds=fixture.scenarios.map(s=>s.id);}
  const calls={search:[],read:[],prompts:[]};
  const space=await new Store(directory).save(fixture);
  const targetURL=fixture.sources[0].url;
  const text=wrongEntity?'另一套房，月租 100 元/月，面积 99 ㎡，单程通勤 1 分钟。':missing?'沿河一居，月租 100 元/月，面积 99 ㎡。通勤未说明。':'沿河一居，月租 100 元/月，面积 99 ㎡，单程通勤 35 分钟。';
  const io={
    search:async query=>{calls.search.push(query);if(delay)await new Promise(r=>setTimeout(r,delay));return [{url:targetURL,title:'软件测试来源',content:text}];},
    fetchSource:async url=>{calls.read.push(url);return text;},
    model:async messages=>{
      const prompt=messages[0].content,input=JSON.parse(messages[1].content);calls.prompts.push(prompt);
      if(prompt.startsWith('You are Prism'))return {reply:'模型建议比较当前候选。',intent:'explain',decisionAnswer:{recommendations:[{candidateId:'housing-1',fields:['price','commute'],reason:'可结合租金与通勤的已知资料比较。'},{candidateId:'housing-2',fields:['price'],reason:'这个也符合预算。'}]}};
      if(prompt.startsWith('Plan a focused'))return {queries:['沿河一居 通勤 详情'],schema:{fields:[]},settings:{limits:{price:99999}}};
      if(prompt.startsWith('Independently review'))return {findings:[]};
      if(prompt.startsWith('Analyze ONLY'))return {insights:[]};
      if(input.sources?.length){const source=input.sources[0];return {candidates:[
        {name:wrongEntity?'另一套房':'沿河一居',sourceId:source.id,facts:{price:{value:100,sourceId:source.id,quote:'月租 100 元/月'},area:{value:99,sourceId:source.id,quote:'面积 99 ㎡'},...(!missing?{commute:{value:wrongEntity?1:35,sourceId:source.id,quote:wrongEntity?'单程通勤 1 分钟':'单程通勤 35 分钟'}}:{})}},
        {name:'无关候选',sourceId:source.id,facts:{price:{value:100,sourceId:source.id,quote:'月租 100 元/月'}}}
      ]};}
      return {queries:[],urls:[],catalogRequests:[]};
    }
  };
  const app=createApp({directory,env:{},io});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.address().port;
  const get=async path=>(await fetch(base+path)).json();
  const post=async(path,data)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:response.status,body:await response.json()};};
  const complete=async id=>{
    for(let n=0;n<500;n++){const job=await get('/api/jobs/'+id);if(job.status==='complete')return get('/api/spaces/'+job.spaceId);if(['failed','interrupted'].includes(job.status))throw new Error(job.error);await new Promise(r=>setTimeout(r,20));}
    throw new Error('Focused fixture timed out');
  };
  return {base,space,calls,get,post,complete,close:async()=>{await app.shutdown();await rm(directory,{recursive:true,force:true});}};
}
