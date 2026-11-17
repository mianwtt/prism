import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createApp } from "../src/server.mjs";
import { defaultSettings } from "../src/engine.mjs";
test("HTTP journey: demo, save, restore old version, export, reject unsafe mutations", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "prism-test-")),
    server = createApp({ directory, env: {} });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await rm(directory, { recursive: true, force: true });
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (path, method = "GET", data) =>
    fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  assert.equal((await call("/")).status, 200);
  assert.equal((await (await call("/api/health")).json()).live, false);
  assert.equal(
    (await (await call("/api/agent")).json()).framework,
    "LangGraph",
  );
  const d = await (await call("/api/spaces/demo", "POST")).json();
  assert.equal(d.version, 1);
  const settings = { ...d.settings, budget: 7500 };
  const saved = await (
    await call("/api/spaces/" + d.id + "/versions", "POST", { settings })
  ).json();
  assert.equal(saved.version, 2);
  assert.equal(saved.parentId, d.id);
  assert.equal(saved.rootId, d.id);
  assert.equal(
    (await (await call("/api/spaces/" + d.id)).json()).settings.budget,
    7000,
  );
  assert.equal(
    (await (await call("/api/spaces/" + saved.id + "/export")).json()).settings
      .budget,
    7500,
  );
  assert.equal(
    (await (await call("/api/spaces/" + d.id + "/versions")).json()).length,
    2,
  );
  const edited = await (
    await call("/api/spaces/" + saved.id + "/versions", "POST", {
      settings,
      reviews: [{ candidateId: "atlas", key: "price", value: 6000 }],
    })
  ).json();
  assert.equal(
    edited.candidates[0].facts.price.confirmation,
    "user-assumption",
  );
  assert.equal(edited.candidates[0].facts.price.sourceId, null);
  assert.equal(edited.candidates[0].facts.price.original.value, 6499);
  assert.equal(
    (
      await call("/api/spaces/" + d.id + "/versions", "POST", {
        settings: { ...settings, budget: -1 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + "/api/spaces/demo", {
        method: "POST",
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("/api/research", "POST", { question: "研究一台笔记本电脑" }))
      .status,
    503,
  );
  assert.equal((await call("/.env")).status, 404);
  const config = {
    baseUrl: "https://example.com/v1",
    model: "test-model",
    modelKey: "fake-model-secret",
    searchKey: "fake-search-secret",
  };
  const savedConfig = await (
    await call("/api/settings", "POST", config)
  ).json();
  assert.equal(savedConfig.ready, true);
  assert.equal(
    JSON.stringify(savedConfig).includes("fake-model-secret"),
    false,
  );
  assert.equal((await (await call("/api/health")).json()).live, true);
  const unchanged = await (
    await call("/api/settings", "POST", {
      ...config,
      model: "second-model",
      modelKey: "",
      searchKey: "",
    })
  ).json();
  assert.equal(unchanged.hasModelKey, true);
  assert.equal(unchanged.hasSearchKey, true);
  assert.equal(
    (
      await call("/api/settings", "POST", {
        ...config,
        modelKey: "injected\nKEY=value",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + "/api/settings", {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      })
    ).status,
    403,
  );
  assert.equal((await call("/data/provider-settings.json")).status, 404);
  const restarted = createApp({ directory, env: {} });
  restarted.listen(0, "127.0.0.1");
  await once(restarted, "listening");
  try {
    const restored = await (
      await fetch(
        "http://127.0.0.1:" + restarted.address().port + "/api/settings",
      )
    ).json();
    assert.equal(restored.model, "second-model");
    assert.equal(restored.ready, true);
    assert.equal(
      JSON.stringify(restored).includes("fake-search-secret"),
      false,
    );
  } finally {
    await new Promise((r) => restarted.close(r));
  }
});
test("async research API persists evidence and exposes a completed job without API keys", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "prism-live-test-"));
  let turn = 0;
  const server = createApp({
    directory,
    env: {},
    io: {
      async model() {
        return ++turn === 1
          ? { action: "search", query: "test laptop" }
          : {
              action: "finish",
              settings: defaultSettings,
              candidates: [
                {
                  name: "Exact test SKU",
                  facts: {
                    memory: {
                      value: 32,
                      sourceId: "s1",
                      quote: "Exact test SKU contains 32 GB of RAM.",
                    },
                  },
                },
              ],
            };
      },
      async search() {
        return [
          {
            url: "https://example.com/sku",
            raw_content: "Exact test SKU contains 32 GB of RAM.",
          },
        ];
      },
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await rm(directory, { recursive: true, force: true });
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const response = await fetch(base + "/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "研究一台适合开发的笔记本电脑" }),
  });
  assert.equal(response.status, 202);
  const created = await response.json();
  let job;
  for (let i = 0; i < 50; i++) {
    job = await (await fetch(base + "/api/jobs/" + created.id)).json();
    if (job.status !== "running") break;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(job.status, "complete");
  assert.equal(job.events.filter((e) => e.type === "search").length, 1);
  const saved = await (await fetch(base + "/api/spaces/" + job.spaceId)).json();
  assert.equal(saved.mode, "live");
  assert.equal(saved.agent.framework, "LangGraph");
  assert.equal(saved.candidates[0].facts.memory.status, "unreviewed");
  assert.equal(saved.sources[0].url, "https://example.com/sku");
});
