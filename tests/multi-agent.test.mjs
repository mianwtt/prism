import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpecialist,specialistTask} from '../src/agents/specialist.mjs';
import {reviewEvidence} from '../src/agents/evidence-review.mjs';
import {runGeneralResearch,checkDecisionCandidates} from '../src/general-research.mjs';
import {evaluateDecision,validateDecisionSchema,validateDecisionSettings} from '../src/decision-schema.mjs';
import {createMcpResearchAdapter} from '../src/mcp-research.mjs';

const schema=validateDecisionSchema({label:'具体方案比较',optionLabel:'方案',fields:[{key:'price',label:'价格',unit:'元',direction:-1},{key:'area',label:'面积',unit:'㎡',direction:1}]});
const question='比较价格不超过4500元、面积至少30㎡的具体方案';
const settings=validateDecisionSettings({limits:{price:4500,area:30}},schema);
const plan={schema,constraints:[{field:'price',value:4500,quote:'价格不超过4500元'},{field:'area',value:30,quote:'面积至少30㎡'}],queries:['公开具体方案'],whatifs:[{name:'预算放宽',changes:[{field:'price',value:5000}]}]};
const contract={question,schema,settings,evidenceRequirements:{}};
const record=(name,id,extra='')=>({id,url:'https://example.org/listing/'+id,title:name,text:`${name} 价格4000元，面积40㎡。${extra}`,kind:'page'});
const rawFor=source=>({name:source.title,sourceId:source.id,facts:{price:{value:4000,sourceId:source.id,quote:'4000元'},area:{value:40,sourceId:source.id,quote:'40㎡'}}});

test('specialists run as compiled isolated subgraphs with role-specific capabilities and fresh invocation context',async()=>{
 let searches=0;const provider={model:async()=>({ok:true}),search:async()=>{searches++;return [];},fetchSource:async()=>'',searchCatalog:async()=>({})};
 const analyst=createSpecialist('analyst',{inspect:async(task,io)=>{
  assert.equal(io.search,undefined);assert.equal(io.fetchSource,undefined);assert.equal(io.searchCatalog,undefined);
  const out=await io.model([{role:'system',content:'Only supplied inputs'},{role:'user',content:JSON.stringify(task)}]);task.private='changed';return {seen:task.name,out};
 }},provider);
 const input={name:'first'},one=await analyst.invoke({phase:'inspect',task:input}),two=await analyst.invoke({phase:'inspect',task:{name:'second'}});
 assert.equal(one.artifact.seen,'first');assert.equal(two.artifact.seen,'second');assert.equal(input.private,undefined);assert.equal(searches,0);assert.equal(one.usage.modelCalls,1);
 await assert.rejects(()=>analyst.invoke({phase:'search',task:{}}),/未被授权/);
});

test('handoff projections omit prior conversation, unrelated candidate pools and source bodies from the coordinator',()=>{
 const parent={question:'旧问题',schema,sources:[{url:'https://example.org/old',title:'旧资料',text:'private-source-body'}],candidates:[{name:'private-old-option'}],conversation:[{content:'private-history'}],evidenceRequirements:{sourcePhotos:true}};
 const state={question,previous:parent,scenario:{id:'path',settings},contract,sources:[record('当前方案','a')],raw:[],trace:[],result:{question,schema,settings,activeScenarioId:'path',scenarios:[{id:'path',settings,candidateIds:['current']}],candidates:[{id:'current',facts:{}},{id:'unrelated',facts:{}}],conversation:parent.conversation,trace:[],agent:{nodes:[]}}};
 const coordinator=JSON.stringify(specialistTask('coordinator',state)),researcher=JSON.stringify(specialistTask('researcher',state)),analyst=specialistTask('analyst',state);
 for(const marker of ['private-history','private-source-body','private-old-option'])assert(!coordinator.includes(marker));
 assert(!researcher.includes('private-history'));assert.deepEqual(analyst.result.candidates.map(c=>c.id),['current']);assert.equal(analyst.result.sources,undefined);
});

test('an independent review can withhold an evidenced field but cannot replace values, invent a finding or reenable a public-price fallback',async()=>{
 const source=record('方案甲','a','需领券才可使用4000元价格。');source.publicPrice={value:4000,quote:'4000元'};
 const raw=[rawFor(source)],before=structuredClone(raw),sources=[source],finding={sourceId:'a',candidateName:'方案甲',field:'price',quote:'4000元',evidenceQuote:'需领券才可使用4000元价格',kind:'conditional-price',reason:'这笔报价需要领券'};
 const out=await reviewEvidence({question,contract,raw,sources,trace:[]},{model:async()=>({findings:[finding,{...finding,sourceId:'fabricated',replacementValue:100}]})},{checkCandidates:checkDecisionCandidates,event:()=>({node:'review'})});
 assert.equal(out.evidenceReview.findings.length,1);assert.equal(out.evidenceReview.ignored,1);assert.deepEqual(raw,before);assert.equal(source.text,sources[0].text);
 const checked=checkDecisionCandidates(out.raw,sources,schema);assert.equal(checked.candidates[0].facts.price.value,null);assert.match(checked.candidates[0].facts.price.reviewReason,/独立审查/);assert.equal(checked.candidates[0].facts.area.value,40);
});

function runtime({conditional=false,reviewUnavailable=false}={}){
 const initial=['方案甲','方案乙','方案丙'].map((name,i)=>record(name,'s'+i,conditional&&i===0?'需领券才可使用4000元价格。':'')),extra=record('方案新','extra'),catalog={url:'https://example.org/listing/catalog',title:'目录',content:'补充详情：https://example.org/listing/extra'},calls=[];
 let reviewerCalls=0;
 const io={
  search:async()=>[...initial.map(s=>({url:s.url,title:s.title,content:s.text})),...(conditional?[catalog]:[])],
  fetchSource:async url=>initial.find(s=>s.url===url)?.text||(url===extra.url?extra.text:catalog.content),
  model:async(messages,metadata)=>{
   const p=messages[0].content,input=JSON.parse(messages[1].content);calls.push({role:metadata.agent,prompt:p,input});
   if(p.startsWith('Analyze this individual'))return plan;
   if(p.startsWith('Independently review')){
    reviewerCalls++;if(reviewUnavailable)throw new Error('review unavailable');
    const c=input.candidates.find(c=>c.name==='方案甲'),fact=c?.facts.price;
    return {findings:conditional&&fact?.status==='cited'?[{sourceId:c.sourceId,candidateName:c.name,field:'price',quote:fact.quote,evidenceQuote:'需领券才可使用4000元价格',kind:'conditional-price',reason:'报价有领取条件'}]:[]};
   }
   if(p.startsWith('Analyze ONLY'))return {summary:'不采纳这句任意结论',insights:[],candidates:[{price:1}],settings:{limits:{price:1}}};
   if(p.startsWith('Select up to 6'))return {urls:[]};
   if(p.startsWith('There are fewer'))return {urls:[extra.url]};
   if(p.startsWith('Return compact JSON {candidates:'))return {candidates:input.sources.filter(s=>/^方案/.test(s.text)).map(s=>rawFor({...s,title:/^(方案[甲乙丙新])/.exec(s.text)?.[1]||s.title}))};
   return {queries:[],urls:[],candidates:[]};
  },
 };
 return {io,calls,get reviewerCalls(){return reviewerCalls;}};
}

test('the actual multi-agent graph invokes four roles with scoped handoffs and the analyst cannot rewrite facts or eligibility',async()=>{
 const r=runtime(),space=await runGeneralResearch(question,r.io);
 assert.equal(space.agent.architecture,'bounded-specialist-subgraphs');assert.deepEqual(new Set(r.calls.map(c=>c.role)),new Set(['coordinator','researcher','reviewer','analyst']));
 assert.equal(space.candidates.length,3);assert(space.candidates.every(c=>c.facts.price.value===4000));assert.equal(space.settings.limits.price,4500);
 assert.equal(space.agent.reviews[0].status,'completed');assert.equal(r.reviewerCalls,1);assert.equal(space.agent.recovery.stopReason,'not-needed');
 assert(space.agent.runs.some(run=>run.role==='researcher'&&run.toolCalls.search>0));assert.equal(space.agent.runs.filter(run=>run.role==='reviewer').length,1);
 assert.equal(evaluateDecision(space.candidates,space.settings,space.schema).filter(row=>row.status==='eligible').length,3);
});

test('the full four-role graph really consumes MCP tool results and records selected Skills',async()=>{
 const r=runtime(),io=createMcpResearchAdapter(r.io),space=await runGeneralResearch(question,io);
 assert.equal(space.candidates.length,3);
 assert(io.mcpTrace().some(item=>item.name==='search_public_sources'));
 assert(io.mcpTrace().some(item=>item.name==='read_public_source'));
 assert(space.agent.runs.every(run=>run.toolTransport==='mcp-in-memory'));
 assert(space.agent.runs.some(run=>run.skills.some(skill=>skill.name==='evidence-review')));
 assert.equal(evaluateDecision(space.candidates,space.settings,space.schema).filter(row=>row.status==='eligible').length,3);
});

test('review findings cause one bounded evidence-repair handoff and at most one post-repair review',async()=>{
 const r=runtime({conditional:true}),space=await runGeneralResearch(question,r.io);
 assert.equal(space.agent.recovery.before.comparable,2);assert.equal(space.agent.recovery.after.comparable,3);assert.equal(r.reviewerCalls,2);
 assert.equal(space.agent.reviews.length,2);assert.equal(space.agent.reviews[0].findings[0].kind,'conditional-price');
 assert.equal(space.candidates.find(c=>c.name==='方案甲').facts.price.status,'unknown');assert(space.candidates.some(c=>c.name==='方案新'));
 assert.equal(space.agent.recovery.calls.read,1);assert.equal(space.agent.recovery.calls.search,0);
});

test('a failed model review is explicitly recorded as unavailable while deterministic evidence gates stay active',async()=>{
 const r=runtime({reviewUnavailable:true}),space=await runGeneralResearch(question,r.io);
 assert.equal(space.agent.reviews[0].status,'unavailable');assert.equal(space.agent.reviews[0].findings.length,0);assert.equal(r.reviewerCalls,1);
 assert(space.warnings.some(w=>w.includes('独立审查未完成')));assert.equal(space.candidates.length,3);
});
