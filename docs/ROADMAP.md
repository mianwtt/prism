# Roadmap and release gates

Prism turns research into a decision you can explore and revisit. The intended differentiator is the connected workflow, rather than a claim that graphs, agents or What-if analysis are new inventions.

## Next priorities — 2026-11-28

These are planned improvements. Existing capabilities and historical measurements are recorded separately below.

| Priority | User benefit | Existing foundation | Evidence required for completion |
| --- | --- | --- | --- |
| **1. Broader usable source coverage** | More selection questions produce genuinely comparable options and offers | Search adapters, observed retailer catalogues, static/Edge readers and a real two-seller task | Repeatable tasks across additional public merchants; record configuration matching, price validity, field gaps and read failures without relaxing the user's requirements |
| **2. Evidence changes and branch impact** | See which recommendation needs reconsidering when a quote or source changes | Source refresh, expiry checks, saved versions and branch-bound advice | Display old/new observations and identify affected branches; retain original snapshots and prevent an invalid quote from remaining an active recommendation |
| **3. Bring-your-own shortlist** | Compare options gathered outside Prism | Complete decision JSON import and user-supplied detail URLs | Bounded candidate-list import with validation and provenance; user-provided values remain distinct from verified webpage observations and never gain citation authority automatically |

## Implemented in the local 0.4 preview

- Question-specific typed dimensions and presentation contracts from the adaptive LangGraph planner.
- Checkpointed research, contextual follow-ups and persistent task recovery.
- Connected canvas with preserved baseline, independent branch scopes, all matching image nodes, targeted recalculation and detail dialogs.
- Continued conversation: exclusion explanations, explicit constraint changes and direct tool execution for explicit research requests, with results returned inline.
- Per-field saved-source excerpts, collection times, review/withdrawal, existing conflicting observations and source rechecking.
- Immutable versions, decision-context capture, reassessment under the recorded conditions and generic version diffs.
- JSON export/import as an independent space, with validation and revoked imported confirmation authority.
- No-key fictional laptop and housing demos, portable multi-branch examples, setup diagnosis and native local setup.
- MIT license, English/Chinese README, contribution/security guidance and CI definitions for Windows/Linux Node 22/24 plus browser tests.
- Official SDK MCP tool discovery/calls, task-selected Skills, phase permissions, call budgets and handoff checks.
- SearXNG deployment and shop-native discovery, plus static and Edge-rendered detail readers.
- Same-configuration seller offers, validated quote-selection branches and source-bound decision advice.
- A decision proposal with recommendations, quotations, branch experiments and Markdown export, separate from the user's personal choice.

Automated graph/UI integration uses controlled providers. The [first public GitHub CI run](https://github.com/mianwtt/prism/actions/runs/44038301786) passed all seven native, browser, packaging and container jobs. Later changes require their own CI run; the historical result does not validate them. Live retrieval quality and the current [quality checks](reports/PREVIEW-QUALITY-2026-11-18.md) are assessed separately.

## Gates before claiming a mature V1

| Gate | Current gap | Evidence required |
| --- | --- | --- |
| Retrieval usefulness | Public-page availability and merchant recall vary. The 2026-11-27 task verified one board configuration across two retailers; this is not a broad coverage measurement. | Reproducible labeled tasks, exact configuration/URL/time, field correctness, quotation correctness, missing detection and task completion measurements |
| Strict configuration recall | Historical Graph 24 original cohort: 9/10, with C03 returning only two qualifying 32GB/lightweight configurations. That full cohort has not been rerun on the current revision. | Broader observed-catalog exploration and repeated fixed-version checks; preserve conditions, failures and distinct-configuration requirements |
| Supplemental discovery | Historical Graph 24 extended cohort: 3/5; E01 found one distinct configuration and Guangzhou E05 two eligible rentals. These figures describe that historical revision. | Typed query constraints, relevant price-filter validation and repeated complete cohorts; no substituted prices, guessed facts or relaxed thresholds |
| Multi-source reconciliation | Same-product identity, separate seller prices, quote branches and export work in the recorded two-retailer task; broader cross-platform coverage remains incomplete. | Same-configuration matching across sources, disagreements retained, no convenient-value selection |
| Broader scenarios | Fixed real-task regression covers five cities; extended tasks add two cities and phones. Strict product recall still needs repeated evaluation; there is no independently labeled dataset. | Repeated fresh tasks across locations and domains, assessed separately from fixtures and supplied-URL replays; include failures and platform limitations |
| Ingestion | JSON decision import works; PDF/Word/Excel/image ingestion does not | Bounded parsers, provenance, failure behavior and isolated processing |
| Usability | Desktop/mobile browser regressions exist; no full accessibility or user study | Keyboard/screen-reader audit, observed first-use completion, clear recovery from empty evidence |
| Distribution | Historical published CI passed its checked revision. Current working-tree tests, Edge checks, live tasks and clean-source results are recorded separately; full no-key research containers remain unverified. | Further target-platform and live-provider coverage beyond the checked profiles |
| GitHub release | [Public repository](https://github.com/mianwtt/prism), actual recordings, complete-source checks and first remote CI run are published | A reviewed prerelease tag; see [publishing](PUBLISHING.md) |

## Acceptance tasks

A new user can start a fictional demo without a key, change a condition and explain the result, inspect evidence, save a personal decision, export it, and import a separate copy. A live task must additionally produce enough source-backed candidate facts to support the requested comparison; a successful graph run with no useful candidates is not a successful research task.

Treat recall, freshness and source correctness as measured outcomes. Do not hide incomplete records, fabricate prices, call fixture data real, or claim an arbitrary-domain capability based only on a dynamic form.

The current same-product walkthrough and actual source links are available in the [recorded case](examples/SAME-PRODUCT-2026-11-27.md) and [acceptance report](reports/MULTI-SOURCE-OFFERS-2026-11-27.md).
