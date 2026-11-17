import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createApp } from "../src/server.mjs";
import { Store } from "../src/store.mjs";
import { demoSpace } from "../src/demo.mjs";
import { editSpace } from "../src/space-edits.mjs";
import { refreshSpace } from "../src/refresh.mjs";
const question = "研究一台适合开发的笔记本电脑";
const source = {
  url: "https://example.com/sku",
  raw_content: "Test laptop has 32 GB memory.",
};
const finish = {
  action: "finish",
  settings: demoSpace().settings,
  candidates: [
    {
      name: "Test laptop",
      facts: {
        memory: { value: 32, sourceId: "s1", quote: source.raw_content },
      },
    },
  ],
};
async function open(directory, io) {
  const server = createApp({ directory, env: {}, io });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  return {
    server,
    base,
    async request(path, body) {
      const response = await fetch(
        base + path,
        body
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {},
      );
      return { status: response.status, data: await response.json() };
    },
  };
}
async function wait(app, id) {
  const start = Date.now();
  while (Date.now() - start < 5000) {
    const { data } = await app.request("/api/jobs/" + id);
    if (data.status !== "running") return data;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error("job timeout");
}
test("SQLite checkpoint and task history survive server replacement; resume skips completed planning", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "prism-durable-"));
  let firstCalls = 0,
    secondCalls = 0;
  const first = await open(directory, {
    async model() {
      firstCalls++;
      return { action: "search", query: "test laptop" };
    },
    async search() {
      throw new Error("temporary search failure");
    },
  });
  let second;
  t.after(async () => {
    await first.server.shutdown();
    if (second) await second.server.shutdown();
    await rm(directory, { recursive: true, force: true });
  });
  const { data: created } = await first.request("/api/research", { question });
  assert.equal((await wait(first, created.id)).status, "failed");
  assert.equal(firstCalls, 1);
  await first.server.shutdown();
  // Simulate metadata left running by an abrupt exit; durable graph state is real.
  const path = join(directory, "jobs", created.id + ".json");
  const metadata = JSON.parse(await readFile(path, "utf8"));
  metadata.status = "running";
  await writeFile(path, JSON.stringify(metadata));
  second = await open(directory, {
    async model() {
      secondCalls++;
      return finish;
    },
    async search() {
      return [source];
    },
  });
  assert.equal(
    (await second.request("/api/jobs/" + created.id)).data.status,
    "interrupted",
  );
  assert.equal(
    (await second.request("/api/jobs/" + created.id + "/resume", {})).status,
    202,
  );
  const done = await wait(second, created.id);
  assert.equal(done.status, "complete");
  assert.equal(done.attempts, 2);
  assert.equal(secondCalls, 1);
  const saved = (await second.request("/api/spaces/" + done.spaceId)).data;
  assert.equal(saved.agent.checkpointStorage, "sqlite");
  assert.equal(saved.agent.modelCalls, 2);
  assert.equal(saved.sources.length, 1);
  assert.equal(
    (await second.request("/api/jobs/" + created.id + "/resume", {})).status,
    409,
  );
  assert.equal((await second.request("/api/spaces")).data.length, 1);
});
test("refresh creates a version, preserves user assumptions, invalidates changed evidence and exposes a diff", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "prism-refresh-"));
  let fixture = demoSpace();
  fixture.mode = "live";
  fixture.sources[0].url = "https://example.com/atlas";
  fixture = editSpace(fixture, {
    reviews: [{ candidateId: "atlas", key: "price", value: 6000 }],
  });
  const original = await new Store(directory).save(fixture);
  const app = await open(directory, {
    async fetchSource() {
      return fixture.sources[0].text.replace("6499", "6999");
    },
  });
  t.after(async () => {
    await app.server.shutdown();
    await rm(directory, { recursive: true, force: true });
  });
  const { status, data: job } = await app.request(
    "/api/spaces/" + original.id + "/refresh",
    {},
  );
  assert.equal(status, 202);
  const done = await wait(app, job.id);
  assert.equal(done.status, "complete");
  const updated = (await app.request("/api/spaces/" + done.spaceId)).data;
  assert.equal(updated.rootId, original.id);
  assert.equal(updated.version, 2);
  assert.equal(updated.candidates[0].facts.price.value, 6000);
  assert.equal(
    updated.candidates[0].facts.price.confirmation,
    "user-assumption",
  );
  assert.equal(updated.candidates[0].facts.memory.status, "unknown");
  assert.equal(
    updated.candidates[0].facts.memory.previousObservation.value,
    32,
  );
  assert.equal(updated.sources[0].refreshStatus, "changed");
  assert.equal(
    (await app.request("/api/spaces/" + original.id)).data.candidates[0].facts
      .memory.status,
    "confirmed",
  );
  const diff = (await app.request("/api/spaces/" + updated.id + "/diff")).data;
  assert.equal(diff.sourceChanges.length, 1);
  assert.ok(diff.factChanges.some((c) => c.field === "memory"));
  assert.equal(diff.ranking.changed, true);
  const rebound = await app.request("/api/spaces/" + updated.id + "/versions", {
    reviews: [
      {
        candidateId: "atlas",
        key: "memory",
        value: 32,
        sourceId: updated.sources[0].id,
        quote: "内存 32 GB。",
      },
    ],
  });
  assert.equal(rebound.status, 201);
  assert.equal(
    rebound.data.candidates[0].facts.memory.confirmation,
    "user-reviewed",
  );
  assert.equal(
    rebound.data.candidates[0].facts.memory.sourceId,
    updated.sources[0].id,
  );
  assert.equal(
    (
      await app.request("/api/spaces/" + updated.id + "/versions", {
        reviews: [
          {
            candidateId: "atlas",
            key: "memory",
            value: 999,
            sourceId: updated.sources[0].id,
            quote: "内存 32 GB。",
          },
        ],
      })
    ).status,
    400,
  );
});
test("failed source refresh retains the snapshot but withdraws confirmation", async () => {
  const fixture = demoSpace();
  fixture.mode = "live";
  fixture.sources[0].url = "https://example.com/atlas";
  const next = await refreshSpace(fixture, {
    async fetchSource() {
      throw new Error("network error");
    },
  });
  assert.equal(next.sources[0].text, fixture.sources[0].text);
  assert.equal(next.sources[0].refreshStatus, "failed");
  assert.equal(next.candidates[0].facts.price.value, 6499);
  assert.equal(next.candidates[0].facts.price.status, "unreviewed");
  assert.equal(fixture.candidates[0].facts.price.status, "confirmed");
});
test("refresh resumes from saved source progress without fetching completed sources again", async () => {
  const fixture = demoSpace();
  fixture.mode = "live";
  fixture.sources[0].url = "https://example.com/a";
  fixture.sources[1].url = "https://example.com/b";
  const calls = [];
  let snapshot;
  const io = {
    async fetchSource(url) {
      calls.push(url);
      return url.endsWith("/a")
        ? fixture.sources[0].text
        : fixture.sources[1].text;
    },
  };
  await assert.rejects(
    refreshSpace(fixture, io, () => {}, {
      onCheckpoint: (state) => {
        snapshot = structuredClone(state);
        throw new Error("simulated process exit");
      },
    }),
    /simulated process exit/,
  );
  const result = await refreshSpace(fixture, io, () => {}, { snapshot });
  assert.deepEqual(calls, ["https://example.com/a", "https://example.com/b"]);
  assert.equal(result.refresh.observations.length, 2);
});
test("candidate edits support rename, pause and unknown manual additions without mutating the baseline", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "prism-edit-"));
  const app = await open(directory, {});
  t.after(async () => {
    await app.server.shutdown();
    await rm(directory, { recursive: true, force: true });
  });
  const original = (await app.request("/api/spaces/demo", {})).data;
  const saved = await app.request("/api/spaces/" + original.id + "/versions", {
    candidateEdits: [
      { action: "rename", candidateId: "atlas", name: "我的开发本" },
      { action: "toggle", candidateId: "aero", enabled: false },
      { action: "add", name: "候选 D" },
    ],
  });
  assert.equal(saved.status, 201);
  assert.equal(saved.data.candidates.length, 4);
  assert.equal(saved.data.candidates[0].originalName, "Atlas 14");
  assert.ok(
    Object.values(saved.data.candidates[3].facts).every(
      (f) => f.status === "unknown",
    ),
  );
  const diff = (await app.request("/api/spaces/" + saved.data.id + "/diff"))
    .data;
  assert.deepEqual(
    diff.candidateChanges.map((c) => c.type),
    ["renamed", "disabled", "added"],
  );
  assert.equal(
    (await app.request("/api/spaces/" + original.id)).data.candidates.length,
    3,
  );
  assert.equal(
    (
      await app.request("/api/spaces/" + original.id + "/versions", {
        candidateEdits: [{ action: "add", name: "" }],
      })
    ).status,
    400,
  );
});
