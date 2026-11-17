# Architecture and product boundaries

Prism's useful unit is a decision space, not a chat answer. A space contains a question, typed model, source snapshots, candidate facts, branch scopes, conversation and a versioned personal decision.

## Research and reasoning

`src/general-research.mjs` implements the adaptive LangGraph sequence:

```mermaid
flowchart LR
  understand --> search --> read --> extract --> corroborate --> recover --> complete --> analyze
```

The planner proposes 1–8 numeric, boolean or categorical dimensions plus a bounded presentation contract. Source extraction checks structured values and excerpts. New concerns can extend the model; old baseline conditions remain preserved. The analyst produces source-backed commentary, not executable formulas or authoritative eligibility.

`src/research-providers.mjs` connects model/search services. ChatOllama handles local Ollama; compatible providers use the HTTP adapter. `src/jobs.mjs` persists task records and graph checkpoints in SQLite. Completed graph steps can resume after restart; an interrupted external request may repeat. Only one research job runs at a time.

The optional application-scoped Redis layer in `src/search-cache.mjs` caches successful search observations with bounded TTLs. Both tofu and Tavily share the adapter; saved sources retain their original observation time. Independent source/price reads and citation rechecks remain uncached. Cache faults fall back to the original search. This is neither a job queue nor model memory; JSON decisions and SQLite checkpoints retain their existing roles. See [the technical report](TECHNICAL-REPORT.md) for keys, counters and evaluation.

The historical laptop workflow remains for compatibility. `src/legacy-decision.mjs` adapts saved laptop records for the shared renderer; it does not choose the schema for new live research.

## What-if is deterministic

`src/decision-schema.mjs` validates dimensions, limits, weights and branch ancestry. A branch owns a candidate-ID scope. New research can expand that branch without mutating its baseline or sibling scopes.

The evaluator separates eligible, excluded, unresolved and disabled candidates. Missing evidence is not a low score. Numeric preference normalization uses declared bounds when present; otherwise it uses the compared pool. Scores express the selected model and preferences, not objective quality or probabilities. Decision records freeze their normalization so later pool changes do not silently alter the recorded model.

`public/branch-canvas.mjs` renders condition nodes and all matching image nodes, with a rooted tree layout and SVG connections. `public/universal-view.mjs` coordinates local recalculation, conversation, scoped research and modal inspection. No condition change is presented as a search unless a research job actually runs.

## Evidence and decision memory

`src/decision-workflow.mjs` checks saved quotations, handles human confirmation/withdrawal, captures decision context and compares versions. Quotations establish provenance to the captured text, not independent truth. `src/source-reconciliation.mjs` combines observations when an explicit supported identifier or the same supported merchant product ID binds them. Global product codes and host-scoped listing IDs have different scopes. Names alone do not authorize merging; disagreements remain unresolved. Identifier matching is a conservative binding rule, not a proof that two publishers describe the same hardware configuration.

`src/general-refresh.mjs` rechecks up to 12 referenced pages per resumable batch. Missing excerpts or failed reads withdraw support while retaining the historical value. It does not infer replacement prices. Follow-up research is a distinct graph job.

`src/store.mjs` commits immutable JSON snapshots with server-generated IDs, ancestry and timestamps. Older records remain accessible. A decision captures its candidate, rationale, original conditions, rules, facts and source metadata; later versions reassess it under that captured model.

## Portable files and boundaries

`src/space-import.mjs` accepts bounded Prism JSON snapshots and adapts historical laptop exports. Import validates the model, IDs, references, branch graph and URL shapes. It creates a new root, drops model analysis/job state and does not inherit human confirmation. Imported sources are never fetched during import. Validated user/assistant conversation records are imported; previous version chains are not. A recorded rationale is restored without claiming that the old full decision context was recreated.

`src/server.mjs` serves the native browser modules and local API. Host/origin checks and CSP reduce accidental cross-site use; they do not make this an authenticated public service. Provider configuration is separate from spaces and never included in exports.

## Verification versus claims

Unit and HTTP tests cover validation, quote support, immutable persistence, calculations, imports and graph recovery. Browser integration uses controlled providers while running the actual graph/API/UI. Fictional demos test interactions across domains. These tests do not establish live search recall, price freshness, source truth or success on arbitrary housing/merchant websites.

See [SEARCH-EVALUATION](reports/SEARCH-EVALUATION.md) for measured retrieval observations and [ROADMAP](ROADMAP.md) for release gates.

## Evidence gaps and conversational action

`src/general-retrieval.mjs` prioritizes concrete merchant pages, allocates original-text excerpts across the selected dimensions, and keeps source engine/query metadata. The `corroborate` node selects up to two candidates needing evidence, performs at most two additional searches, reads up to four fresh pages and extracts at most two fresh batches. A missing result does not generate a fact.

The optional `src/public-product-read.mjs` adapter currently reads visible Suning page prices for at most two distinct product IDs. It uses anonymous public pages, does not attempt login, and does not gate information collection on stock. Price text and observation time are preserved. Other platforms still depend on available public source content.

`src/source-passages.mjs` can bind whitespace variants and recover a contiguous original numeric passage for a proposed value on a concrete detail page. Currency recovery requires an actual saved public-price observation; it cannot choose a price from a recommendation list. Known compatible unit conversions retain the original quote and are explained in the evidence view.

The conversational API accepts `autoResearch:true`. Only an explicit research request then starts an adaptive job after saving the conversation. The response supplies an ephemeral `nextAction` with a job ID; the UI waits while keeping the workspace visible. The completed version contains the research outcome in the conversation. Pure explanation turns remain read/explain operations. Existing API callers without the flag retain the earlier behavior.
