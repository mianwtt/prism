import test from "node:test";
import assert from "node:assert/strict";
import { validateCandidates } from "../src/evidence.mjs";
import { evaluate, defaultSettings, factIssue, validateSettings } from "../src/engine.mjs";
import { demoSpace } from "../src/demo.mjs";
import { editSpace, diffSpaces } from "../src/space-edits.mjs";
test('an exact configuration launch price is not treated as a current merchant offer',()=>{
 const quote='其中24GB+512GB版本6599元';
 const result=validateCandidates([{name:'MateBook14 (24GB/512GB)',facts:{price:{value:6599,quote,sourceId:'news',evidence:[{value:6599,quote,sourceId:'news'}]}}}],
 [{id:'news',title:'MateBook14 正式发布',text:quote}]);
 assert.equal(result.candidates[0].facts.price.value,null);
 assert.match(result.candidates[0].facts.price.reviewReason,/上市参考价/);
});

test("matching a number is insufficient: reject wrong units, ambiguous configurations and non-SKU prices", () => {
  for (const [key, value, quote] of [
    ["memory", 16, "Price 16 CNY; memory is 32 GB."],
    ["memory", 16, "Memory: 216 GB, not a supported SKU."],
    ["memory", 24, "内存支持 24 GB / 32 GB 两种配置。"],
    ["battery", 56, "电池容量为 56 Wh，测试条件未说明。"],
    ["price", 6599, "官方起售价为 6599 元"],
    ["price", 5799, "京东参考价：5799 元"],
    ["price", 5999.2, "部分地区国补后 5999.2 元"],
    ["price", 6799.15, "叠加国家补贴后，实际售价降至6799.15元"],
  ]) {
    const { candidates } = validateCandidates([
      { name: "Book (24GB/512GB)", facts: { [key]: { value, quote, sourceId: "s1" } } },
    ], [{ id: "s1", text: quote }]);
    const c = candidates[0];
    assert.equal(c.facts[key].value, null, quote);
    assert.equal(c.facts[key].rejectedEvidence.quote, quote);
    assert.equal(c.name, "Book");
    assert.equal(c.proposedName, "Book (24GB/512GB)");
  }
});

test("duplicate configurations merge while contradictory prices remain unknown and inspectable", () => {
  const raw = [6499, 6999].map(value => ({ name: "Same SKU", facts: { price: {
    value, sourceId: "s" + value, quote: `Same SKU costs ${value} CNY.`,
  } } }));
  const sources = raw.map(c => ({ id: c.facts.price.sourceId, text: c.facts.price.quote }));
  const result = validateCandidates(raw, sources);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].facts.price.value, null);
  assert.equal(result.candidates[0].facts.price.conflictingEvidence.length, 2);
  assert.match(result.candidates[0].facts.price.reviewReason, /冲突/);
});

test("provisional mode is explicit, preserves evidence status and never fills gaps or uses ambiguous legacy evidence", () => {
  const d = demoSpace(), c = d.candidates[0];
  c.facts.memory = { value: 32, status: "unreviewed", sourceId: "s1", quote: "Exact SKU memory: 32 GB." };
  assert.equal(evaluate([c], d.settings)[0].status, "unresolved");
  const settings = { ...d.settings, calculationMode: "provisional" };
  assert.equal(evaluate([c], settings)[0].status, "eligible");
  assert.equal(c.facts.memory.status, "unreviewed");
  c.facts.memory.quote = "内存支持 24 GB / 32 GB 两种配置。";
  assert.equal(evaluate([c], settings)[0].status, "unresolved");
  c.facts.memory.quote = "Exact SKU memory: 32 GB.";
  c.facts.battery.value = null;
  assert.equal(evaluate([c], settings)[0].status, "unresolved");
  settings.weights = { ...settings.weights, battery: 0 };
  assert.equal(evaluate([c], settings)[0].status, "eligible");
  settings.budget = 2425;
  assert.equal(evaluate([c], settings)[0].status, "excluded");
  c.facts.memory.reviewReason = "Source changed";
  assert.match(factIssue("memory", c.facts.memory), /重新核验/);
  assert.equal(evaluate([c], { ...settings, budget: 7000 })[0].status, "unresolved");
});

test("calculation mode persists in versions and appears in their diff", () => {
  const before = demoSpace();
  const after = editSpace(before, { settings: { ...before.settings, calculationMode: "provisional" } });
  assert.equal(after.settings.calculationMode, "provisional");
  assert.ok(diffSpaces(before, after).settingsChanges.some(c => c.field === "calculationMode"));
  assert.equal(before.settings.calculationMode, undefined);
  assert.throws(() => validateSettings({ ...defaultSettings, calculationMode: "whatever" }), /计算模式/);
});
