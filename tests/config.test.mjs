import test from "node:test";
import assert from "node:assert/strict";
import { publicSettings } from "../src/config.mjs";
import { liveConfigured } from "../src/research.mjs";
test("XXX placeholders are never considered valid provider credentials", () => {
  const env = {
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_MODEL: "qwen3.5:9b",
    LLM_API_KEY: "ollama",
    TAVILY_API_KEY: "XXX",
  };
  assert.equal(publicSettings(env).hasModelKey, true);
  assert.equal(publicSettings(env).hasSearchKey, false);
  assert.equal(liveConfigured(env), false);
  assert.equal(liveConfigured({ ...env, TAVILY_API_KEY: "test-key" }), true);
});
