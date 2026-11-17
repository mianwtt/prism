import test from "node:test";
import assert from "node:assert/strict";
import { demoSpace } from "../src/demo.mjs";
import { evaluate, budgetTransitions, comparison } from "../src/engine.mjs";
test("budget equality is inclusive and an increased budget admits the third candidate", () => {
  const d = demoSpace();
  const initial = evaluate(d.candidates, d.settings);
  assert.equal(initial.find((c) => c.id === "aero").status, "excluded");
  assert.equal(initial[0].id, "atlas");
  const next = evaluate(d.candidates, { ...d.settings, budget: 7299 });
  assert.equal(next[0].id, "aero");
  assert.deepEqual(comparison(initial, next).entered, ["Aero 13"]);
});
test("candidate scores do not depend on alternatives entering the feasible set", () => {
  const d = demoSpace(),
    a = evaluate(d.candidates, d.settings),
    b = evaluate(d.candidates, { ...d.settings, budget: 8000 });
  assert.equal(
    a.find((c) => c.id === "atlas").score,
    b.find((c) => c.id === "atlas").score,
  );
});
test("missing or unreviewed facts cannot silently participate in ranking", () => {
  const d = demoSpace();
  d.candidates[0].facts.memory.status = "unreviewed";
  assert.equal(
    evaluate(d.candidates, d.settings).find((c) => c.id === "atlas").status,
    "unresolved",
  );
  d.candidates[0].facts.memory.status = "confirmed";
  d.candidates[0].facts.battery.value = null;
  assert.equal(
    evaluate(d.candidates, d.settings).find((c) => c.id === "atlas").status,
    "unresolved",
  );
  const s = structuredClone(d.settings);
  s.weights.battery = 0;
  assert.equal(
    evaluate(d.candidates, s).find((c) => c.id === "atlas").status,
    "eligible",
  );
});
test("tight constraints exclude all choices and no recommendation is fabricated", () => {
  const d = demoSpace(),
    r = evaluate(d.candidates, { ...d.settings, budget: 1000 });
  assert.equal(r.filter((c) => c.status === "eligible").length, 0);
});
test("rejects zero weights, NaN, negative budget and unknown scoring dimensions", () => {
  const d = demoSpace();
  for (const patch of [
    { budget: -1 },
    { budget: NaN },
    { weights: { price: 0, memory: 0, weight: 0, battery: 0 } },
    { weights: { price: 20, memory: 20, weight: 20, unknown: 20 } },
  ])
    assert.throws(() => evaluate(d.candidates, { ...d.settings, ...patch }));
});
test("sensitivity identifies an exact eligibility threshold and winner change", () => {
  const d = demoSpace(),
    t = budgetTransitions(d.candidates, d.settings).find(
      (t) => t.budget === 7299,
    );
  assert.equal(t.winner, "aero");
  assert.equal(t.changed, true);
});
