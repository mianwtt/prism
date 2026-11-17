import test from "node:test";
import assert from "node:assert/strict";
import { searchWithTofu } from "../src/tofu-search.mjs";
import { publicSettings, saveSettings } from "../src/config.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { providers } from "../src/research.mjs";
test("saving tofu settings succeeds without a Tavily key and provider routing stays local", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "prism-tofu-config-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const env = { TOFU_PYTHON: process.execPath };
  const saved = await saveSettings(
    join(directory, "provider-settings.json"),
    {
      baseUrl: "http://localhost:11434/v1",
      model: "local-model",
      modelKey: "ollama",
      searchKey: "",
      searchProvider: "tofu",
    },
    env,
  );
  assert.equal(saved.ready, true);
  assert.equal(saved.hasSearchKey, false);
  assert.equal(env.SEARCH_PROVIDER, "tofu");
  const localOnly = providers({
    LLM_BASE_URL: "https://example.com/v1",
    SEARCH_PROVIDER: "tofu",
    TOFU_PYTHON: "Z:/does-not-exist/prism-python.exe",
  });
  await assert.rejects(localOnly.search("laptop"), /setup:search/);
});
test("tofu mode does not require a commercial search key when a runtime is configured", () => {
  const config = publicSettings({
    SEARCH_PROVIDER: "tofu",
    TOFU_PYTHON: process.execPath,
    LLM_MODEL: "local-model",
    LLM_API_KEY: "ollama",
    TAVILY_API_KEY: "XXX",
  });
  assert.equal(config.searchProvider, "tofu");
  assert.equal(config.hasSearchKey, false);
  assert.equal(config.ready, true);
});
test("missing tofu runtime is not advertised as configured", () => {
  const config = publicSettings({
    SEARCH_PROVIDER: "tofu",
    TOFU_PYTHON: "Z:/does-not-exist/prism-python.exe",
    LLM_MODEL: "local-model",
    LLM_API_KEY: "ollama",
  });
  assert.equal(config.ready, false);
});
test("tofu bridge rejects invalid queries and reports a missing interpreter without exposing logs", async () => {
  assert.throws(() => searchWithTofu(""), /关键词/);
  await assert.rejects(
    searchWithTofu("laptop", {
      TOFU_PYTHON: "Z:/does-not-exist/prism-python.exe",
    }),
    /setup:search/,
  );
});
