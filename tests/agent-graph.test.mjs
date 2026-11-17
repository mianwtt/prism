import test from "node:test";
import assert from "node:assert/strict";
import { MemorySaver } from "@langchain/langgraph";
import {
  createResearchGraph,
  runResearch,
  agentInfo,
} from "../src/research.mjs";
import { defaultSettings } from "../src/engine.mjs";
const question = "研究一台适合开发的笔记本电脑";
const source = {
  url: "https://example.com/laptop",
  raw_content: "Test laptop costs 6499 CNY and has 32 GB RAM.",
};
const finish = {
  action: "finish",
  settings: defaultSettings,
  candidates: [
    {
      name: "Test laptop",
      facts: {
        price: { value: 6499, sourceId: "s1", quote: source.raw_content },
        memory: { value: 32, sourceId: "s1", quote: source.raw_content },
      },
    },
  ],
};
test("an empty follow-up search preserves prior evidence and can finish honestly", async () => {
  let calls = 0,
    searches = 0;
  const result = await runResearch(question, {
    async model() {
      calls++;
      return calls < 3 ? { action: "search", query: "query " + calls } : finish;
    },
    async search() {
      return ++searches === 1 ? [source] : [];
    },
  });
  assert.equal(result.sources.length, 1);
  assert.equal(result.candidates.length, 1);
  assert.ok(result.trace.some((e) => e.type === "observation"));
  assert.equal(result.agent.searches, 2);
});
test("actual compiled LangGraph pauses before search and resumes without repeating planning", async () => {
  let calls = 0,
    searches = 0;
  const saver = new MemorySaver();
  const graph = createResearchGraph(
    {
      async model() {
        return ++calls === 1
          ? { action: "search", query: "test laptop specs" }
          : finish;
      },
      async search() {
        searches++;
        return [source];
      },
    },
    { checkpointer: saver, interruptBefore: ["search"] },
  );
  const config = {
    configurable: { thread_id: "resume-test" },
    recursionLimit: 32,
  };
  await graph.invoke({ question }, config);
  const paused = await graph.getState(config);
  assert.deepEqual(paused.next, ["search"]);
  assert.equal(calls, 1);
  assert.equal(searches, 0);
  const output = await graph.invoke(null, config);
  assert.equal(searches, 1);
  assert.equal(calls, 2);
  assert.equal(output.result.agent.framework, "LangGraph");
  assert.equal(output.result.candidates[0].facts.price.status, "unreviewed");
  assert.deepEqual((await graph.getState(config)).next, []);
  const history = [];
  for await (const snapshot of graph.getStateHistory(config))
    history.push(snapshot);
  assert.ok(history.length >= 6);
  const drawing = await graph.getGraphAsync();
  assert.match(drawing.drawMermaid(), /verify/);
});
test("schema-invalid model actions repair before invoking tools", async () => {
  let calls = 0,
    searches = 0;
  const result = await runResearch(question, {
    async model(messages) {
      calls++;
      if (calls === 1) return { action: "execute_shell", command: "untrusted" };
      if (calls === 2) {
        assert.match(messages.at(-1).content, /不符合操作结构/);
        return { action: "search", query: "valid query" };
      }
      return finish;
    },
    async search() {
      searches++;
      return [source];
    },
  });
  assert.equal(searches, 1);
  assert.equal(result.agent.repairs, 1);
  assert.equal(result.agent.modelCalls, 3);
  assert.ok(result.trace.some((t) => t.node === "repair"));
});
test("invalid JSON repairs are bounded and do not execute any search", async () => {
  let calls = 0;
  await assert.rejects(
    runResearch(question, {
      async model() {
        calls++;
        throw new SyntaxError("bad JSON");
      },
      async search() {
        assert.fail("invalid actions cannot invoke tools");
      },
    }),
    /上限/,
  );
  assert.equal(calls, 3);
});
test("search exhaustion permits a final finish action without a fifth search", async () => {
  let calls = 0,
    searches = 0;
  const result = await runResearch(question, {
    async model() {
      calls++;
      return calls <= 5
        ? { action: "search", query: "query " + calls }
        : finish;
    },
    async search() {
      searches++;
      return [source];
    },
  });
  assert.equal(searches, agentInfo.limits.searches);
  assert.equal(result.agent.repairs, 1);
  assert.equal(result.agent.modelCalls, 6);
});
test("search provider failures remain failures and cannot generate fictional results", async () => {
  await assert.rejects(
    runResearch(question, {
      async model() {
        return { action: "search", query: "laptop" };
      },
      async search() {
        throw new Error("search unavailable");
      },
    }),
    /search unavailable/,
  );
});
