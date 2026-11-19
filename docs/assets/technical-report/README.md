# Technical report figures

[Technical report](../../TECHNICAL-REPORT.md) · [Media provenance](../README.md)

These engineering diagrams describe Prism at commit `0aa305f03ceab83815d5d82da4da7e6c997e7e6d`, checked on 2026-11-17. Each has an editable SVG and a 2× PNG copy. The core report uses eleven figures. Figure numbers follow reading order; filenames retain their creation order.

| Figure | Asset | Purpose and evidence |
| --- | --- | --- |
| 01 | [Architecture](01-architecture.svg) | Module responsibilities; precise execution order is shown separately in figure 02. |
| 02 | [Request sequence](02-request-sequence.svg) | HTTP acceptance, background execution, checkpoints, result save and polling. Repeated calls are condensed. |
| 03 | [Agent boundaries](05-agent-boundaries.svg) | Eight fixed graph stages and bounded decisions within those stages; not eight independent agents. |
| 04 | [Search pipeline](03-search-pipeline.svg) | Application/provider boundaries and the installed tofu-search 0.12.25 dependency. |
| 05 | [BM25](04-bm25.svg) | Formula-derived teaching example. [Calculation data](bm25-example.json) are synthetic text scores, not retrieval accuracy. |
| 06 | [Evidence gates](06-evidence-gates.svg) | Deterministic validation categories; citation support does not establish independent real-world truth. |
| 07 | [What-if inheritance](07-whatif-inheritance.svg) | Synthetic values illustrating inheritance, explicit overrides and candidate scope. |
| 08 | [Redis](08-redis-cache.svg) | Optional exact-request cache, process-local coalescing, failure handling and illustrative timestamps. |
| 09 | [Data model](10-data-model.svg) | Saved source, fact, scenario, media and decision relationships. |
| 10 | [Recovery](09-checkpoint-lifecycle.svg) | Execution state, stable result ID and business save boundaries. |
| 11 | [Conversation](13-conversation.svg) | Explanation, verified condition change and new research have different effects. |
| Supplement | [Evaluation](12-evaluation.svg) | Recorded checks and a controlled cache experiment, with their limits; separate from the core report. |
| Supplement | [Docker](11-docker.svg) | Separate deployment explanation retained as an asset; not part of the core report. |

Diagrams are authored vector explanations. No product or rental photograph was generated, replaced or used to imply an observation. Historical interface screenshots are documented separately in [media provenance](../README.md).
