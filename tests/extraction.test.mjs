import test from "node:test";
import assert from "node:assert/strict";
import {candidateSources,extractCandidateFacts,locateQuotedFact} from "../src/source-extraction.mjs";
import {validateCandidates} from "../src/evidence.mjs";
import {researchMessages} from "../src/agent-context.mjs";

test("short exact numeric/unit citations are valid without padding invented text",()=>{
  const quote="约1.95kg";
  const result=validateCandidates([{name:"TestBook 14",facts:{weight:{value:1.95,sourceId:"a",quote}}}],[{id:"a",text:"机身重量："+quote}]);
  assert.equal(result.candidates[0].facts.weight.value,1.95);
  assert.equal(result.candidates[0].facts.weight.status,"unreviewed");
});
test("RAM/storage configuration is not confused with alternative RAM capacities",()=>{
  const quote="TestBook 14 (24GB/512GB)";
  const result=validateCandidates([{name:"TestBook 14",facts:{memory:{value:24,sourceId:"a",quote}}}],[{id:"a",text:quote}]);
  assert.equal(result.candidates[0].facts.memory.value,24);
});
test("a quoted field from an explicitly different storage configuration cannot be mixed into the candidate",()=>{
  const quote="机身重量 1.68kg，内存16GB。";
  const result=validateCandidates([{name:"TestBook 14 (16GB/512GB)",facts:{weight:{value:1.68,sourceId:"a",quote}}}],
    [{id:"a",title:"TestBook 14 (16GB/1TB)参数",text:quote}]);
  assert.equal(result.candidates[0].facts.weight.value,null);
  assert.match(result.candidates[0].facts.weight.reviewReason,/不能混用/);
});
test("paraphrased numeric observations can locate original text only within their cited page",()=>{
  const source={id:"a",text:"TestBook 14 的机身轻约 1.33 kg，圆键盘版，具体重量视配置而异。"};
  const raw={value:1.33,sourceId:"a",quote:"这款机器的重量约为 1.33 kg。"};
  const located=locateQuotedFact("weight",raw,source);
  assert.ok(source.text.includes(located.quote));
  assert.equal(located.quoteRecovery.originalQuote,raw.quote);
  assert.equal(locateQuotedFact("weight",raw,{...source,text:"包装重量 1.33 kg"}).quote,raw.quote);
  assert.equal(locateQuotedFact("price",{...raw,value:6499},source).quote,raw.quote);
});
test("focused extraction selects related pages, expands short text and still rejects fabricated quotes",async()=>{
  const original=[{id:"a",title:"TestBook 14 官方规格",url:"https://example.com/a",text:"TestBook 14 memory: 32 GB."},{id:"b",title:"OtherBook 99",url:"https://example.com/b",text:"OtherBook 99 memory: 64 GB."}];
  const raw=[{name:"TestBook 14",facts:{}}];
  assert.deepEqual(candidateSources(raw[0],original).map(s=>s.id),["a"]);
  const result=await extractCandidateFacts(raw,original,{
    fetchSource:async()=>"TestBook 14 memory: 32 GB. Body weight: 1.42 kg.",
    extractFacts:async messages=>{
      const payload=JSON.parse(messages[1].content);
      assert.equal(payload.untrustedSources.length,1);
      assert.match(payload.untrustedSources[0].text,/1.42 kg/);
      return {facts:{weight:{value:1.42,sourceId:"a",quote:"Body weight: 1.42 kg."},price:{value:6499,sourceId:"a",quote:"Invented offer: 6499 CNY."}}};
    }
  });
  assert.equal(result.readCalls,1);assert.equal(result.modelCalls,1);
  const checked=validateCandidates(result.candidates,result.sources).candidates[0];
  assert.equal(checked.facts.weight.value,1.42);assert.equal(checked.facts.price.value,null);
  assert.equal(original[0].text,"TestBook 14 memory: 32 GB.");
});
test("focused extraction deduplicates repeated candidates and respects its three-call bound",async()=>{
  const candidates=["Abook 1","Abook 1","Bbook 2","Cbook 3","Dbook 4"].map(name=>({name,facts:{}}));
  const sources=[{id:"a",title:"Abook 1 Bbook 2 Cbook 3 Dbook 4",text:"Memory: 32 GB.",url:"https://example.com/a"}];
  let calls=0;
  const result=await extractCandidateFacts(candidates,sources,{extractFacts:async()=>{calls++;return{facts:{}};}});
  assert.equal(calls,3);assert.equal(result.modelCalls,3);
});
test("context budgets favor a parameter-rich specification over unrelated search clutter",()=>{
  const sources=Array.from({length:15},(_,i)=>({id:"s"+i,title:"Java tutorial",text:"Irrelevant Java text. ".repeat(200)}));
  sources.push({id:"spec",title:"TestBook 14 官方规格",text:"内存 32 GB，重量 1.42 kg。".repeat(300)});
  const output=JSON.parse(researchMessages({searches:4,repairs:0,sources,messages:[{role:"system",content:"rules"},{role:"user",content:"question"}]})[2].content);
  assert.ok(output.untrustedSearchResults.find(s=>s.id==="spec").text.length>2000);
  assert.ok(output.untrustedSearchResults.reduce((n,s)=>n+s.text.length,0)<=12000);
});
