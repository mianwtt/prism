import assert from "node:assert/strict";
import { providers, runResearch } from "../src/research.mjs";
const base = process.env.LLM_BASE_URL || "http://localhost:11434/v1";
const url = new URL(base);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  url.port !== "11434"
)
  throw new Error("此测试只允许本机 Ollama，不会调用付费模型或搜索服务");
const model = providers({
  LLM_BASE_URL: base,
  LLM_MODEL: process.env.LLM_MODEL || "qwen3.5:9b",
  LLM_API_KEY: "ollama",
}).model;
let searchCalls = 0;
const result = await runResearch(
  "这是离线工具测试。请搜索并研究虚构的 FixtureBook 14 测试笔记本，预算 7000 元，内存至少 16GB。搜索返回资料后即可结束，只使用测试来源，不要补充现实产品。",
  {
    model,
    async search() {
      searchCalls++;
      return [
        {
          url: "https://example.com/fixturebook",
          title: "Synthetic fixture, not a real product",
          raw_content:
            "FixtureBook 14 is a FICTIONAL laptop used only for software testing. Exact configuration: 32 GB memory. Price: 6499 CNY. Weight: 1.42 kg. Manufacturer battery hours: 12 hours. None of these values describe a real product.",
        },
      ];
    },
  },
  (e) => console.log(JSON.stringify({ node: e.node, type: e.type })),
);
assert.equal(result.agent.framework, "LangGraph");
assert.ok(searchCalls > 0 && searchCalls <= 4);
assert.ok(result.candidates.some((c) => c.name.includes("FixtureBook")));
assert.ok(
  result.candidates.some((c) =>
    Object.values(c.facts).some((f) => f.status === "unreviewed"),
  ),
);
console.log(
  JSON.stringify({
    ok: true,
    framework: result.agent.framework,
    modelAdapter: "ChatOllama",
    searchTool: "synthetic fixture; NO real web search",
    searches: searchCalls,
    modelCalls: result.agent.modelCalls,
    candidates: result.candidates.length,
  }),
);
