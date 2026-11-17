import test from "node:test";
import assert from "node:assert/strict";
import { enrichCandidateMedia } from "../src/media.mjs";
import { demoSpace } from "../src/demo.mjs";
test('a matching merchant product page is tried after the official page has no image',async()=>{
 const d=demoSpace();d.candidates=[d.candidates[0]];d.candidates[0].name='惠普星Book 16';
 d.sources=[{id:'official',url:'https://www.hp.com/cn-zh/starbook16',title:'HP 星Book16 规格'},
 {id:'shop',url:'https://www.suning.com/itemcanshu/000/123.html',title:'惠普星Book16 酷睿5 16GB 512GB 参数'}];
 let selected;
 await enrichCandidateMedia(d.candidates,d.sources,{enrichImages:async urls=>{selected=urls;return[{sourceUrl:urls[1],url:'https://imgservice.suning.cn/photo.jpg'}]}});
 assert.equal(selected.length,2);assert.equal(d.candidates[0].media.sourceId,'shop');
});

test("images retain source provenance, prefer official pages and never alter candidate facts", async () => {
  const d = demoSpace(), original = structuredClone(d.candidates[0].facts);
  d.candidates[0].name = "HUAWEI MateBook 14";
  d.sources[0].title = "HUAWEI MateBook 14 Official specifications";
  d.sources[0].url = "https://consumer.huawei.com/official";
  d.sources[3].url = "https://example.com/offer";
  let selected;
  await enrichCandidateMedia(d.candidates, d.sources, { async enrichImages(urls) {
    selected = urls;
    return [
      { sourceUrl: "https://consumer.huawei.com/official", url: "https://example.com/photo.png" },
      { sourceUrl: "https://example.com/not-retrieved", url: "https://example.com/unlinked.png" },
    ];
  } });
  assert.deepEqual(selected, ["https://consumer.huawei.com/official"]);
  assert.equal(d.candidates[0].media.sourceId, "source-atlas");
  assert.match(d.candidates[0].media.label, /具体配置待核实/);
  assert.deepEqual(d.candidates[0].facts, original);
  assert.equal(d.candidates[1].media, undefined);
});

test("image failures remain optional and unsafe image protocols are discarded", async () => {
  const d = demoSpace(), warnings = [];
  d.sources[0].url = "https://example.com/official";
  await enrichCandidateMedia(d.candidates, d.sources, { enrichImages: async () => { throw new Error("unavailable"); } }, warnings);
  assert.equal(warnings.length, 1);
  await enrichCandidateMedia(d.candidates, d.sources, { enrichImages: async () => [{ sourceUrl: d.sources[0].url, url: "javascript:alert(1)" }] });
  assert.equal(d.candidates[0].media, undefined);
});

test("an article cover or another brand's photo is never bound as the candidate product image", async () => {
  const d = demoSpace();
  d.candidates[0].name = "华硕无畏 16";
  d.sources[0].url = "https://consumer.huawei.com/matebook/";
  d.sources[0].title = "HUAWEI MateBook 14 官方页面";
  const io = { enrichImages: async urls => [{ sourceUrl: urls[0], url: "https://example.com/huawei-photo.png" }] };
  await enrichCandidateMedia(d.candidates, d.sources, io);
  assert.equal(d.candidates[0].media, undefined);
  d.sources[0].url = "https://www.sohu.com/a/laptop-roundup";
  d.sources[0].title = "华硕无畏16 等十款笔记本合集";
  await enrichCandidateMedia(d.candidates, d.sources, io);
  assert.equal(d.candidates[0].media, undefined);
});
test("official imagery can be shown even when numeric extraction is still missing",async()=>{
  const d=demoSpace();d.candidates=[d.candidates[0]];
  d.candidates[0].name="HUAWEI MateBook 14";
  for(const key of Object.keys(d.candidates[0].facts))d.candidates[0].facts[key]={value:null,status:"unknown",quote:"",sourceId:null};
  d.sources=[{id:"official",title:"HUAWEI MateBook 14 官方规格",url:"https://consumer.huawei.com/matebook-14/",text:"Specifications unavailable."}];
  await enrichCandidateMedia(d.candidates,d.sources,{enrichImages:async urls=>[{sourceUrl:urls[0],url:"https://consumer.huawei.com/photo.png"}]});
  assert.equal(d.candidates[0].media.sourceId,"official");
  assert.equal(d.candidates[0].facts.price.value,null);
});
test("recognized official domains outrank a third-party quote even without the word official in the title",async()=>{
  const d=demoSpace();d.candidates=[d.candidates[0]];d.candidates[0].name="HUAWEI MateBook 14";
  d.sources[0].url="https://example.com/quote";d.sources[0].title="MateBook 14 报价";
  d.sources[3].url="https://consumer.huawei.com/matebook-14/";d.sources[3].title="HUAWEI MateBook 14 规格";
  let selected;
  await enrichCandidateMedia(d.candidates,d.sources,{enrichImages:async urls=>{selected=urls;return[];}});
  assert.deepEqual(selected,["https://consumer.huawei.com/matebook-14/"]);
});
