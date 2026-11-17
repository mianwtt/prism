import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDecisionChange,evaluateDecision,validateDecisionSchema} from '../src/decision-schema.mjs';
import {housingDemo,housingContract} from '../src/general-space.mjs';
import {editSpace} from '../src/space-edits.mjs';
import {checkDecisionCandidates,runGeneralResearch,createGeneralResearchGraph,planDecision} from '../src/general-research.mjs';
import {MemorySaver} from '@langchain/langgraph';
import {demoSpace} from '../src/demo.mjs';

test('agent-selected constraints preserve explicit user units and leave unspecified conditions empty',async()=>{
  const {schema,settings}=await planDecision('杭州租房，预算4000元，面积至少30平方米，通勤不超过45分钟',{model:async()=>({schema:housingDemo().schema})});
  assert.deepEqual(settings.limits,{price:4000,area:30,commute:45});
  assert.deepEqual(schema.fields.map(f=>f.unit),['元/月','㎡','分钟']);
  const empty=await planDecision('杭州租房，需要了解一些房源',{model:async()=>({schema:housingDemo().schema})});
  assert.deepEqual(empty.settings.limits,{price:null,area:null,commute:null});
});
test('one parser and evaluator support housing and arbitrary dimensions without laptop assumptions',()=>{
  const d=housingDemo(),next=parseDecisionChange('租金增加1000，面积至少50平方米',d.settings,d.schema);
  assert.deepEqual(next.settings.limits,{price:5000,area:50,commute:45});
  assert.equal(evaluateDecision(d.candidates,next.settings,d.schema).filter(r=>r.status==='eligible').length,1);
  assert.equal(evaluateDecision(d.candidates,next.settings,d.schema)[0].id,'housing-2');
  const schema=validateDecisionSchema({id:'custom',label:'出行',fields:[{key:'time',label:'耗时',unit:'分钟',direction:-1,aliases:['时间']}]});
  assert.equal(parseDecisionChange('时间改为90',{limits:{time:120},weights:{time:1}},schema).settings.limits.time,90);
  assert.throws(()=>validateDecisionSchema({fields:[{key:'__proto__',label:'x',unit:'x',direction:1}]}),/无效/);
});
test('baseline is restored after omission, immutable after forged edits and survives eight branches',()=>{
  const d=housingDemo(),original=structuredClone(d);
  const branches=Array.from({length:8},(_,i)=>({id:'branch-'+i,name:'情景'+i,settings:{...structuredClone(d.settings),limits:{...d.settings.limits,price:4500+i*100}}}));
  const updated=editSpace(d,{scenarios:branches,activeScenarioId:'branch-7'});
  assert.equal(updated.scenarios.length,9);assert.equal(updated.scenarios[0].name,'当前情况');
  assert.deepEqual(updated.baselineSettings,d.settings);
  const posted=structuredClone(updated.scenarios);posted[0].settings.limits.price=1;posted[0].candidateIds=[];
  const again=editSpace(updated,{scenarios:posted,activeScenarioId:'scenario-baseline'});
  assert.equal(again.settings.limits.price,4000);assert.equal(again.scenarios[0].candidateIds.length,4);
  assert.deepEqual(d,original);
  const laptop=demoSpace();laptop.scenarios=[{id:'scenario-baseline',name:'原始条件',settings:structuredClone(laptop.settings)}];
  const saved=editSpace(laptop,{scenarios:[{id:'branch',name:'新情景',settings:{...laptop.settings,budget:9000}}]});
  assert.equal(saved.scenarios[0].id,'scenario-baseline');assert.equal(saved.scenarios[0].settings.budget,7000);
});
test('housing evidence cannot cross properties, invent values or infer commute from distance',()=>{
  const {schema}=housingContract('杭州租房'),sources=[{id:'a',title:'沿河一居',text:'沿河一居 月租3200元/月，面积32㎡，距离公司3公里。'},{id:'b',title:'地铁两居',text:'地铁两居 月租4500元/月，面积60㎡。'}];
  const raw=[{name:'沿河一居',sourceId:'a',facts:{price:{value:3200,sourceId:'a',quote:'月租3200元/月'},area:{value:60,sourceId:'b',quote:'面积60㎡'},commute:{value:3,sourceId:'a',quote:'距离公司3公里'}}},{name:'不存在的房源',sourceId:'a',facts:{}}];
  const {candidates}=checkDecisionCandidates(raw,sources,schema);
  assert.equal(candidates.length,1);assert.equal(candidates[0].facts.price.value,3200);assert.equal(candidates[0].facts.area.value,null);assert.equal(candidates[0].facts.commute.value,null);
});
test('real general LangGraph executes search/read/extraction and resumes from its checkpoint',async()=>{
  let searches=0,models=0;
  const text='沿河一居 月租3200元/月，面积32㎡，通勤42分钟。';
  const io={search:async()=>{searches++;return [{url:'https://example.org/property/1',title:'沿河一居',content:text}]},fetchSource:async()=>text,model:async messages=>{models++;if(messages[0].content.startsWith('Analyze'))return {schema:housingDemo().schema,queries:['杭州具体房源','杭州公开租房详情']};if(messages[0].content.startsWith('The first sources'))return {queries:[]};const source=JSON.parse(messages[1].content).sources[0];return {candidates:[{name:'沿河一居',sourceId:source.id,facts:Object.fromEntries([['price',3200,'月租3200元/月'],['area',32,'面积32㎡'],['commute',42,'通勤42分钟']].map(([k,value,quote])=>[k,{value,quote,sourceId:source.id}]))}]};}};
  const events=[],result=await runGeneralResearch('杭州租房，预算4000元，面积至少30平米，通勤最多45分钟',io,e=>events.push(e));
  assert.equal(searches,2);assert.equal(models,5);assert.equal(result.candidates.length,1);assert.equal(result.agent.framework,'LangGraph');assert.equal(result.sources[0].kind,'page');
  assert.equal(evaluateDecision(result.candidates,result.settings,result.schema)[0].status,'eligible');assert.deepEqual(events.map(e=>e.node).filter((x,i,a)=>a.indexOf(x)===i),['understand','search','read','extract','recover','complete','analyze']);
  const saver=new MemorySaver(),graph=createGeneralResearchGraph(io,{checkpointer:saver}),config={configurable:{thread_id:'housing-resume'},interruptBefore:['extract']};
  await graph.invoke({question:result.question},config);const before=searches;
  const output=await graph.invoke(null,{configurable:config.configurable});
  assert.equal(searches,before);assert.equal(output.result.candidates.length,1);
});
test('new housing observations keep the original candidate facts and baseline pool intact',async()=>{
  const parent=housingDemo();parent.mode='live';parent.sources[0].url='https://example.org/property/1';
  const before=structuredClone(parent);
  const scenarios=[...parent.scenarios,{id:'new-condition',name:'提高预算',settings:parseDecisionChange('租金增加1000',parent.settings,parent.schema).settings,candidateIds:parent.candidates.map(c=>c.id)}];
  const text='沿河一居 月租3300元/月，面积32㎡，通勤42分钟。';
  const io={search:async()=>[{url:parent.sources[0].url,title:'沿河一居',content:text}],model:async messages=>{if(messages[0].content.startsWith('Analyze'))return {schema:parent.schema,queries:['具体房源']};const s=JSON.parse(messages[1].content).sources[0];return {candidates:[{name:'沿河一居',sourceId:s.id,facts:{price:{value:3300,sourceId:s.id,quote:'月租3300元/月'}}}]};}};
  const result=await runGeneralResearch(parent.question,io,()=>{},{previous:parent,scenarios,scenario:scenarios[1]});
  assert.equal(result.candidates[0].facts.price.value,3200);assert.deepEqual(result.baselineCandidateIds,before.baselineCandidateIds);assert.equal(result.candidates.at(-1).facts.price.value,3300);assert.deepEqual(parent,before);
});
