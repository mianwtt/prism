# Evidence validation regression corpus

Run `npm run evaluate:evidence` to reproduce the committed fictional corpus at `tests/fixtures/decision-evidence-corpus.json`. Detailed output is written to ignored `work/evidence-evaluation/latest.json`.

The current corpus contains **35 labeled cases**: 15 should retain a supported value and 20 should reject it. They cover public price formatting, starting/reference/conditional prices, currency and billing periods, number boundaries, RAM versus VRAM, net versus shipping weight, capacity versus time, compatible unit conversions, explicit boolean polarity, categorical values and invented quotations.

These are regression cases for deterministic validation rules. They are not real merchant observations, a held-out benchmark, a measure of LLM extraction accuracy, a web-search recall estimate or proof that publishers' claims are true. The examples were constructed to exercise known failure modes. Passing them must not be advertised as “100% research accuracy.”

Additional integration tests exercise explicit-identifier reconciliation, same-product page binding, conflicting values, branch-local updates, targeted missing-field research, photo provenance and conversational tool execution with controlled sources. Live measurements and failed trials are documented separately in [SEARCH-EVALUATION](SEARCH-EVALUATION.md).

For useful next additions, supply a redistributable saved public excerpt with an exact configuration identifier, capture time and independently reviewed expected field labels. Keep real private source snapshots, authentication data and personal decisions out of the corpus.
