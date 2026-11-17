import { defaultSettings } from "./engine.mjs";
export function demoSpace() {
  const rows = [
    ["atlas", "Atlas 14", "均衡开发本", 6499, 32, 1.42, 12],
    ["forge", "Forge 15", "预算优先", 5999, 16, 1.65, 8],
    ["aero", "Aero 13", "便携优先", 7299, 32, 1.3, 15],
  ];
  const sources = rows.map(([id, name, , price, memory, weight, battery]) => ({
    id: "source-" + id,
    title: name + " · 固定测试资料",
    url: null,
    retrievedAt: "2026-11-02T00:00:00.000Z",
    kind: "fixture",
    text: `${name}。价格 ${price} 元。内存 ${memory} GB。重量 ${weight} kg。标称续航 ${battery} 小时。以上均为虚构测试数据，不对应任何在售商品。`,
  }));
  for (const [id, name, , price, memory] of rows) sources.push({
    id: "offer-" + id, title: name + " · 合成渠道报价", url: null,
    retrievedAt: "2026-11-02T00:00:00.000Z", kind: "fixture",
    text: `${name} 同一测试配置，价格 ${price} 元，内存 ${memory} GB。合成渠道资料，不是真实商家或实际报价。`,
  });
  return {
    title: "Java 开发笔记本：预算与便携性对比",
    question:
      "预算 7000 元，选一台适合 Java 开发的笔记本，关注内存、重量和价格。",
    mode: "demo",
    settings: structuredClone(defaultSettings),
    sources,
    candidates: rows.map(([id, name, tag, price, memory, weight, battery]) => ({
      id,
      name,
      tag,
      facts: Object.fromEntries(
        Object.entries({ price, memory, weight, battery }).map(
          ([key, value]) => [
            key,
            {
              value,
              sourceId: "source-" + id,
              quote: sources.find((s) => s.id === "source-" + id).text,
              status: "confirmed",
              confirmation: "synthetic-fixture",
              evidence: [
                { value, sourceId: "source-" + id, quote: sources.find(s => s.id === "source-" + id).text, status: "confirmed" },
                ...(["price", "memory"].includes(key) ? [{ value, sourceId: "offer-" + id, quote: sources.find(s => s.id === "offer-" + id).text, status: "confirmed" }] : []),
              ],
            },
          ],
        ),
      ),
    })),
    trace: [
      {
        type: "demo",
        message: "已载入固定测试资料；没有发起联网搜索或模型调用。",
      },
    ],
  };
}
