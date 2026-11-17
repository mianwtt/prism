import test from "node:test";
import assert from "node:assert/strict";
import { evidenceExcerpt, researchMessages } from "../src/agent-context.mjs";
test("bounded model context preserves original sources and marks omissions", () => {
  const text =
    "Opening. " +
    "irrelevant paragraph ".repeat(200) +
    " Memory 32GB; weight 1.42 kg. " +
    "footer ".repeat(200);
  const excerpt = evidenceExcerpt(text, 700);
  assert.ok(excerpt.length <= 700);
  assert.match(excerpt, /32GB/);
  assert.match(excerpt, /omitted/);
  for (const segment of excerpt.split("\n[… omitted …]\n"))
    assert.ok(text.includes(segment));
  const sources = Array.from({ length: 16 }, (_, i) => ({
    id: "s" + i,
    text,
    url: "https://example.com/" + i,
  }));
  const state = {
    searches: 4,
    repairs: 0,
    sources,
    messages: [
      { role: "system", content: "rules" },
      { role: "user", content: "original question" },
    ],
    repairMessage: null,
  };
  const messages = researchMessages(state, 12000),
    observation = JSON.parse(messages.at(-1).content);
  assert.equal(messages[1].content, "original question");
  assert.ok(
    observation.untrustedSearchResults.reduce((n, s) => n + s.text.length, 0) <=
      12000,
  );
  assert.ok(observation.untrustedSearchResults.every((s) => s.excerpt));
  assert.equal(sources[0].text, text);
  assert.equal(observation.remainingSearches, 0);
});
