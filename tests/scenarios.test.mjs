import test from "node:test";
import assert from "node:assert/strict";
import { demoSpace } from "../src/demo.mjs";
import { scenarioAnalysis, validateScenarios } from "../src/scenarios.mjs";
import { editSpace, diffSpaces } from "../src/space-edits.mjs";
import { validateCandidates } from "../src/evidence.mjs";
import { refreshSpace } from "../src/refresh.mjs";

test("branch analysis exposes an actual winner switch and eligibility change without altering baseline", () => {
  const d = demoSpace(), original = structuredClone(d);
  const next = { ...d.settings, budget: 8000 };
  const result = scenarioAnalysis(d.candidates, d.settings, next);
  assert.equal(result.diff.previous, "Atlas 14");
  assert.equal(result.diff.current, "Aero 13");
  assert.deepEqual(result.diff.entered, ["Aero 13"]);
  assert.equal(result.rows.find(r => r.id === "aero").entered, true);
  assert.equal(result.rows.find(r => r.id === "atlas").delta, 0);
  assert.equal(result.changes[0].label, "预算");
  assert.deepEqual(d, original);
  const noEvidence = structuredClone(d.candidates);
  for (const c of noEvidence) c.facts.price.value = null;
  assert.equal(scenarioAnalysis(noEvidence, d.settings, next).diff.current, null);
});

test("versioned scenario branches validate bounds, retain independent settings and appear in diff", () => {
  const before = demoSpace();
  const scenarios = [{ id: "a", name: "基准副本", settings: before.settings }, { id: "b", name: "增加预算", settings: { ...before.settings, budget: 8000 } }];
  const after = editSpace(before, { scenarios });
  scenarios[0].settings.budget = 0;
  assert.equal(after.scenarios[0].settings.budget, 7000);
  assert.equal(after.scenarios[1].settings.budget, 8000);
  assert.equal(diffSpaces(before, after).scenarioChanges.length, 2);
  assert.throws(() => validateScenarios([...after.scenarios, after.scenarios[0]]), /重复/);
  assert.throws(() => validateScenarios(Array(25).fill(after.scenarios[0])), /1–24/);
});

test("multiple source observations preserve disagreements instead of selecting the most convenient quote", () => {
  const sources = [{ id: "a", text: "Exact SKU memory: 16 GB." }, { id: "b", text: "Exact SKU memory: 32 GB." }];
  const { candidates } = validateCandidates([{ name: "Exact SKU", facts: { memory: {
    value: 16, sourceId: "a", quote: sources[0].text,
    evidence: [{ value: 32, sourceId: "b", quote: sources[1].text }, { value: 64, sourceId: "b", quote: sources[1].text }],
  } } }], sources);
  const fact = candidates[0].facts.memory;
  assert.equal(fact.value, null);
  assert.equal(fact.evidence.length, 2);
  assert.equal(fact.conflictingEvidence.length, 2);
  assert.match(fact.reviewReason, /不一致/);
});

test("two matching citations stay unreviewed and both remain available for comparison", () => {
  const quote = "Same configuration memory: 32 GB.";
  const result = validateCandidates([{ name: "Exact SKU", facts: { memory: { value: 32, sourceId: "a", quote,
    evidence: [{ value: 32, sourceId: "b", quote }] } } }], [{ id: "a", text: quote }, { id: "b", text: quote }]);
  const fact = result.candidates[0].facts.memory;
  assert.equal(fact.value, 32);
  assert.equal(fact.status, "unreviewed");
  assert.equal(fact.evidence.length, 2);
});

test("changes to an additional cited source invalidate confirmation while retaining the primary observation", async () => {
  const d = demoSpace();
  d.mode = "live";
  d.sources = d.sources.filter(s => ["source-atlas", "offer-atlas"].includes(s.id));
  d.sources[1].url = "https://example.com/offer";
  const changed = await refreshSpace(d, { fetchSource: async () => "The old offer is unavailable now." });
  const f = changed.candidates[0].facts.price;
  assert.equal(f.value, 6499);
  assert.equal(f.status, "unreviewed");
  assert.ok(f.reviewReason);
});
