import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { providers, runResearch } from "../src/research.mjs";
import { searchWithTofu, projectRoot } from "../src/tofu-search.mjs";
const io = providers(process.env);
const start = Date.now();
const result = await runResearch(
  "帮我研究适合 Java 开发的笔记本电脑，预算 7000 元，至少 16GB 内存，重量不超过 2kg。请寻找 3 个具体候选，优先官方资料。只能填写来源支持的数字，无法确认价格或具体配置时标为未知，不要混用不同配置。",
  io,
  (event) =>
    console.log(
      JSON.stringify({
        node: event.node,
        type: event.type,
        message: event.message,
      }),
    ),
);
await mkdir(resolve(projectRoot, "work/tofu-evaluation"), { recursive: true });
await writeFile(
  resolve(projectRoot, "work/tofu-evaluation/live-agent-0.3.1.json"),
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify({
    seconds: (Date.now() - start) / 1000,
    candidates: result.candidates.map((c) => ({
      name: c.name,
      matchedFacts: Object.values(c.facts).filter(
        (f) => f.status === "unreviewed",
      ).length,
    })),
    sources: result.sources.length,
    agent: result.agent,
  }),
);
