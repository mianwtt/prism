import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.mjs";
import { demoSpace } from "../src/demo.mjs";
test("a retried completed job returns its immutable committed result without duplicate versions", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "prism-store-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new Store(directory),
    id = randomUUID(),
    fixture = { ...demoSpace(), researchJobId: randomUUID() };
  const first = await store.save(fixture, null, { id });
  const retry = await store.save(
    { ...fixture, title: "a different title" },
    null,
    { id },
  );
  assert.equal(retry.title, first.title);
  assert.equal((await store.list()).length, 1);
  assert.ok((await readdir(directory)).every((name) => name.endsWith(".json")));
  await assert.rejects(
    store.save({ ...fixture, researchJobId: randomUUID() }, null, { id }),
    { code: "EEXIST" },
  );
});
