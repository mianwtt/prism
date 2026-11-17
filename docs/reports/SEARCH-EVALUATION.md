# Search backend evaluation — 2026-11-02

Decision: use **tofu-search for native local development**, retaining Tavily as an optional backend. Coze was not tested because no published workflow/API access was supplied. This decision is based on a small live test on this machine, not a statistically reliable comparison of services.

## Environment and method

- Windows, isolated CPython 3.11.15, `tofu-search==0.12.25`, Node.js 24.19.0.
- The originally supplied standalone repository has older source metadata; the published 0.12.25 package links to the same owner's ToFu monorepo. The tested version is the installed PyPI distribution, not an assumed checkout of old main.
- No commercial search key, no Coze account, no tofu-side LLM filtering or rewrite, no authenticated browser sessions, and no optional Playwright browser fallback.
- Three cold search cases, maximum four final results each; 40-second library search deadline. Two direct URL reads. Raw source snapshots and diagnostics are kept only under ignored `work/tofu-evaluation/`.
- More than 300 characters of extracted text counts as a body-bearing result. This measures extraction availability, not factual accuracy or useful primary-source coverage.

## Observed search results

| Query                                                    | Seconds | Final results | Bodies >300 characters |
| -------------------------------------------------------- | ------: | ------------: | ---------------------: |
| 7000元 32GB 轻薄 笔记本 Java 开发                        |   12.12 |             4 |                      3 |
| 联想 ThinkBook 14 官方 内存 重量 参数                    |   12.51 |             4 |                      4 |
| ASUS Zenbook 14 OLED UX3405 weight memory specifications |    7.86 |             4 |                      4 |

Total: 12 results, 11 body-bearing results. The first query returned mainly recommendation/editorial pages, so it is useful for discovery rather than proof of current prices. The targeted queries returned Lenovo and ASUS official pages. Region-specific ASUS pages are not independent corroborating sources and can describe different configurations. No claim is made that all returned pages are relevant or correct.

Example source URLs returned by the test:

- https://tk.lenovo.com.cn/product/1043468.html
- https://www.lenovo.com.cn/wiki/article-50205.html
- https://www.asus.com/laptops/for-home/zenbook/asus-zenbook-14-oled-ux3405/techspec/

Direct reads:

| URL                                            | Seconds | Extracted characters |
| ---------------------------------------------- | ------: | -------------------: |
| https://docs.python.org/3/library/asyncio.html |    1.24 |                7,072 |
| ASUS global specifications URL above           |    1.06 |               15,013 |

## Actual LangGraph + local model + live search run

The question requested three Java-development laptops under 7000 CNY, at least 16GB RAM and at most 2kg, with unknown facts explicitly retained. After the fixes described below, the real local `qwen3.5:9b`, ChatOllama adapter, LangGraph and tofu-search completed the run in **82.344 seconds**, with **4 searches, 5 model calls, 13 saved sources and 3 proposed candidates**.

Across 12 modeled fields (price, memory, weight, battery for each candidate), **6 matched a source quote and remained unreviewed; 6 were unknown**. No fact was automatically confirmed. Some prices were starting/reference prices and some source pages listed multiple memory variants, so exact SKU/price applicability still needs human review. Candidate labels also require checking; an emitted label is not proof that every configuration detail has been sourced. This is not full product acceptance or a measured recommendation-accuracy score.

## Initial failure and changes

The first complete Agent trial repeatedly investigated one model and ended with an empty query result. The initial bridge incorrectly aborted the entire run for that empty result. The source history was also too large for a small model's default context setting.

Changes: preserve existing evidence after empty searches; report missing information explicitly; keep the original question in bounded model context; select original parameter-related source excerpts with omission markers; use a 16,384-token local model context; guide Chinese/CNY research to use Chinese queries and discover multiple candidates before repeatedly investigating one missing price.

## Remaining limitations

- Single-machine, small-sample observations; no repeated latency distribution, load test, uptime test or fair head-to-head service benchmark.
- No real Coze/Tavily comparison was performed. Their account-specific plugin availability, quotas and costs remain unverified here.
- No guarantee that every page is accessible; the first run included an empty search. Failed extraction is not evidence that a fact does not exist.
- Price freshness, regional differences, mixed SKUs and subjective battery comparisons still require checks.
- Optional local search adds Python/uv setup. The current Docker image contains Node only and does not bundle this backend.

## 0.2.1 quality audit

Rechecking the earlier saved run with the stricter evidence gate retains only three fields: Huawei weight, HP memory and HP weight. The earlier six quote matches included a starting price, a reference price and a multi-configuration memory quote. They were not verified SKU facts.

A fresh real local Qwen/LangGraph/tofu run took 117.919 seconds, four searches and five model calls, retrieving 16 sources. It returned three rows, including an identical configuration twice. Two prices matched their quotes but were explicitly conditional on government subsidies. After adding the conditional-price and duplicate gates and replaying that saved output, only two distinct proposed configurations remain and neither has a usable numeric field. The unchanged original run and both audit outputs remain in ignored work files. No historical user space was overwritten.

This run exposed failures rather than establishing improved recommendation accuracy. Four-search planning by the local model still needs better coverage and a labeled extraction evaluation. The implemented gate and UI prevent these particular failures from silently producing a ranking; they do not make the model's research complete or independently true.

## 0.4 investigation — 2026-11-03

Two real tofu queries returned six results in 16.785 and 17.650 seconds. One specific parameter result had no body, one dynamic retail page had only 967 characters, while several other pages had 6–10k-character bodies. Search availability, body retrieval and extraction failure are different problems.

A discovery experiment using two fixed generic queries performed poorly (one retained page and no accepted numeric facts). That generic seeding was removed; it is not the production discovery strategy. A planner-led run before that experiment still spent all four queries on one family, exposing the local model's coverage limitations.

The targeted supplement flow then executed one query for each of the three saved candidates, returning ten pages (nine with bodies), one additional page read and three extraction calls in 70.540 seconds. Its then-current gate accepted three fields. Subsequent deterministic revalidation of that saved output corrected the 24GB/512GB false ambiguity and source-quote copying, while rejecting an ASUS 1TB source for the saved 512GB candidate. That revalidation retained Huawei memory/weight/video-playback hours and HP memory; it was not a second live model run and does not establish exact-SKU accuracy. No usable exact-configuration prices were obtained. All accepted facts remain unreviewed.

The original real outputs, failed experiment and revalidation remain under ignored work files. Offline regression tests verify bounded extraction, conflicting configurations, source namespacing and preservation of user assumptions. Software regression success is not proof of complete shopping research.

## Reproduction

Run `npm run setup:search` once. Search probes: `work\tofu-venv\Scripts\python.exe scripts\evaluate-tofu.py` on Windows. The optional `scripts/smoke-live-research.mjs` runs actual model inference and real searches, saving local results under ignored work; it is not part of offline CI and may return different results as pages and engines change.

## 2026-11-09 — adaptive research and missing-field investigation

The native no-key tofu backend remains in use. Two fresh availability probes returned 7 results, 6 with bodies of at least 300 characters, in 13.575 and 14.468 seconds. Results included Suning pages, ASUS's site and aggregator/editorial pages. This does not establish source relevance, configuration correctness or price accuracy.

The real local-model adaptive workflow initially failed before searching: the planner emitted incompatible field identifiers/directions and constraints referring to keys absent from its schema. Bounded repair previously repeated a generic instruction rather than receiving the actual validation error. This was corrected; safe snake_case keys, numeric thresholds, comparator directions and compatible units now have explicit validation/repair behavior. Unsupported default criteria are removed when the request supplies clear anchored priorities.

Subsequent live runs still exposed incomplete data. One completed 143.198-second run yielded two candidate records, two cited fields and zero eligible choices. Another 138.277-second run yielded one candidate, one cited field and zero eligible choices. These are failures to complete a useful comparison, even though the graph completed.

Investigation found available data was lost through truncated excerpts, whitespace variants in names, noncontiguous model quotations, gram/kilogram mismatch, and an unconnected public-price reader. Excerpts now allocate space across the chosen dimensions. Same-product parameter and price pages can bind by their exact supported merchant product ID. Original numeric passages can be located for a proposed value on a concrete detail page; prices require an actual public-price observation rather than arbitrary number recovery. Stock is retained as context and does not prevent information collection.

Revalidating the unchanged captured sources and model proposals recovered two candidates with source-backed price/RAM/weight and two eligible results. This was a saved-data revalidation, not a new live run or independent fact check. Historical outputs remain unchanged under ignored `work/`.

A separate fresh end-to-end local-model/tofu run completed in **161.489 seconds** with **6 model calls, 4 search calls, 9 explicit fetchSource calls**, 8 retained sources, 4 candidate records, 7 cited fields, **1 eligible candidate and 1 attached page-preview image**. Source site groups were Suning, ZOL, ASUS and Blogspot; the presence of these sites does not imply that an eligible candidate has independent cross-platform corroboration. The optional public-browser price reads are additional to the explicit fetchSource count. No explicit global configuration identifier passed the matching gate in that run.

This is an improvement over the observed failed runs, but still not enough to claim reliable multi-option live comparison. The main remaining gaps are model omissions, generic names, detailed cross-platform identifier coverage and repeatable completion across tasks. Private raw sources, model proposals and summaries are kept under `work/general-live-evaluation/`; none were inserted into the user's saved decisions.

The new [35-case fictional evidence corpus](EVIDENCE-EVALUATION.md) passed all its regression labels. This tests validation gates, not live extraction accuracy. Controlled graph/browser integration separately verifies cross-source conflicts and explicit conversational research requests without requiring a process panel.
