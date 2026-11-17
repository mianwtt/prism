# Roadmap and release gates

Prism turns research into a decision you can explore and revisit. The intended differentiator is the connected workflow, rather than a claim that graphs, agents or What-if analysis are new inventions.

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

Automated graph/UI integration uses controlled providers. CI definitions are present; remote GitHub jobs are not claimed to have run. Native local verification is separate from Docker verification.

## Gates before claiming a mature V1

| Gate | Current gap | Evidence required |
| --- | --- | --- |
| Retrieval usefulness | Merchant recall and anonymous prices vary; complete real example uses one platform | Reproducible labeled tasks, exact configuration/URL/time, field correctness, quotation correctness, missing detection and task completion measurements |
| Multi-source reconciliation | Existing disagreements can be inspected; explicit-identifier and same-product reconciliation exists; broad cross-platform identity coverage is incomplete | Same-configuration matching across sources, disagreements retained, no convenient-value selection |
| Broader scenarios | Fresh Hangzhou/Chengdu rental tasks now each produce six comparable source-backed records/photos; a broader labeled task set is still missing | Repeated fresh tasks across locations and domains, assessed separately from fixtures and supplied-URL replays; include failures and platform limitations |
| Ingestion | JSON decision import works; PDF/Word/Excel/image ingestion does not | Bounded parsers, provenance, failure behavior and isolated processing |
| Usability | Desktop/mobile browser regressions exist; no full accessibility or user study | Keyboard/screen-reader audit, observed first-use completion, clear recovery from empty evidence |
| Distribution | Clean Windows Node 22/24 installations, 161 unit/HTTP tests and runtime smoke pass; Docker/Linux not yet verified | Actual CI results on Linux and a passing container smoke |
| GitHub release | Public preview material, actual recording, complete-source checks and release notes prepared | Reviewed staged tree, owner repository, passing remote CI and a prerelease tag; see [publishing](PUBLISHING.md) |

## Acceptance tasks

A new user can start a fictional demo without a key, change a condition and explain the result, inspect evidence, save a personal decision, export it, and import a separate copy. A live task must additionally produce enough source-backed candidate facts to support the requested comparison; a successful graph run with no useful candidates is not a successful research task.

Treat recall, freshness and source correctness as measured outcomes. Do not hide incomplete records, fabricate prices, call fixture data real, or claim an arbitrary-domain capability based only on a dynamic form.
