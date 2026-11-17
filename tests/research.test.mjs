import test from "node:test";
import assert from "node:assert/strict";
import { runResearch, validateCandidates, safeUrl } from "../src/research.mjs";
import { defaultSettings } from "../src/engine.mjs";
test("a verbatim quote containing a different number cannot support an extracted value", () => {
  const quote = "Test laptop has 32 GB memory and costs 6,499 CNY.";
  const { candidates } = validateCandidates(
    [
      {
        name: "Laptop",
        facts: {
          memory: { value: 64, sourceId: "s1", quote },
          price: { value: 6499, sourceId: "s1", quote },
        },
      },
    ],
    [{ id: "s1", text: quote }],
  );
  assert.equal(candidates[0].facts.memory.status, "unknown");
  assert.equal(candidates[0].facts.price.status, "unreviewed");
});
test("agent selects a follow-up search and finishes with linked unreviewed facts", async () => {
  let turns = 0;
  const queries = [];
  const events = [];
  const result = await runResearch(
    "找一台适合 Java 开发的笔记本电脑",
    {
      async model(messages) {
        turns++;
        if (turns === 1) return { action: "search", query: "laptop specs" };
        if (turns === 2) {
          assert.match(messages.at(-1).content, /remainingSearches/);
          return { action: "search", query: "exact model price CNY" };
        }
        return {
          action: "finish",
          settings: { ...defaultSettings, budget: 9000, calculationMode: "provisional" },
          candidates: [
            {
              name: "Test SKU",
              facts: {
                price: {
                  value: 6499,
                  sourceId: "s2",
                  quote: "Test SKU costs 6499 CNY.",
                },
              },
            },
          ],
        };
      },
      async search(query) {
        queries.push(query);
        return [
          {
            url: "https://example.com/" + queries.length,
            title: "Source",
            raw_content:
              queries.length === 1
                ? "Test SKU memory is 32 GB."
                : "Test SKU costs 6499 CNY.",
          },
        ];
      },
    },
    (e) => events.push(e),
  );
  assert.equal(queries.length, 2);
  assert.equal(result.sources.length, 2);
  assert.equal(result.candidates[0].facts.price.status, "unreviewed");
  assert.equal(result.candidates[0].facts.weight.value, null);
  assert.equal(events.filter((e) => e.type === "search").length, 2);
  assert.equal(result.settings.budget, 9000);
  assert.equal(result.settings.calculationMode, "reviewed");
});
test("fabricated source IDs, nonmatching quotes, bad URLs and non-numeric values are rejected", () => {
  const sources = [{ id: "s1", text: "A laptop has 32 GB of RAM." }];
  const { candidates } = validateCandidates(
    [
      {
        name: "Laptop",
        facts: {
          memory: { value: 32, sourceId: "invented", quote: sources[0].text },
          price: { value: 100, sourceId: "s1", quote: "invented quote" },
        },
      },
    ],
    sources,
  );
  assert.equal(candidates[0].facts.memory.status, "unknown");
  assert.equal(candidates[0].facts.price.value, null);
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("https://user:password@example.com"), null);
});
test("agent cannot exceed four actual searches", async () => {
  let searches = 0;
  await assert.rejects(
    runResearch("请研究适合开发的笔记本电脑", {
      async model() {
        return { action: "search", query: "again" };
      },
      async search() {
        searches++;
        return [];
      },
    }),
    /上限/,
  );
  assert.equal(searches, 4);
});
test("agent cannot claim a live result without retrieved sources", async () => {
  await assert.rejects(
    runResearch("请研究适合开发的笔记本电脑", {
      async model() {
        return { action: "finish", candidates: [{ name: "Made up" }] };
      },
      async search() {
        assert.fail("a finish action must not trigger search");
      },
    }),
    /没有检索/,
  );
});
