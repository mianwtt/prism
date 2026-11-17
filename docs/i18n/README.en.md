<div align="center">

[简体中文](../../README.md) · **English**

<img src="../../public/favicon.svg" width="64" height="64" alt="Prism logo">

# Prism

**An AI research agent with a canvas for every “what if.”**

Find the evidence. Explore the alternatives. Keep the reasoning behind your choice.

[![Checks](https://github.com/mianwtt/prism/actions/workflows/check.yml/badge.svg)](https://github.com/mianwtt/prism/actions/workflows/check.yml) [![MIT license](https://img.shields.io/badge/License-MIT-246e64)](../../LICENSE) [![LangGraph](https://img.shields.io/badge/Agent-LangGraph-246e64)](../ARCHITECTURE.md) [![Local first](https://img.shields.io/badge/Storage-Local_first-526773)](../../.github/SECURITY.md) [![Preview](https://img.shields.io/badge/Status-0.4_preview-526773)](../ROADMAP.md)

[Quick start](#quick-start) · [Features](#features) · [Examples](#examples) · [Agent architecture](#agent-architecture) · [Documentation](#documentation)

</div>

![Prism laptop decision canvas: budget, memory and weight create connected What-if branches](../assets/laptop-canvas.png)

*Laptop canvas captured from Prism with historical Suning product observations and corresponding source images. Five display branches are curated hypotheses; saved prices are not live offers.*

Your budget changes. A new requirement matters. You want to know why an option disappeared. Prism keeps the research connected to an interactive **What-if canvas**, so you can explore those changes and continue the conversation with the same evidence.

## Quick start

Clone and run with **Node.js 24** and npm:

```sh
git clone https://github.com/mianwtt/prism.git
cd prism
npm ci
npm start
```

Open **[localhost:4317](http://localhost:4317)** and choose a laptop or housing demo. Change a condition, click an option for details, then save your decision. Both demos use fictional data and need no model or search key. The interface currently uses Chinese.

### Connect your agent

1. Run an Ollama model, or prepare a compatible Chat Completions endpoint.
2. For search without a commercial key, install [uv](https://docs.astral.sh/uv/) and run:

   ```sh
   npm run setup:search
   ```

3. Open **研究设置**, choose **tofu-search**, and connect your model. Native Ollama uses `http://localhost:11434/v1`, an installed model ID, and `ollama` in the key field.
4. Ask your question. Continue from the canvas when you want to change a condition or research more options.

[Setup, provider options and troubleshooting →](../SETUP.md)

## Features

- **Research that continues with you.** The agent searches, reads public pages and organizes source-backed options. Ask a follow-up or explicitly request more research along a selected path.
- **What-if you can interact with.** Click a condition or move its slider. Matching options update immediately; the baseline stays intact, descendants inherit changes, and explicit overrides remain their own.
- **Evidence behind each option.** Open a photo to inspect prices, parameters, saved quotations and source links in a floating window. Inspect disagreements and compare any two branches.
- **A model shaped by your question.** The agent proposes comparison fields: numbers, yes/no requirements or categories. Laptop and housing choices use the same canvas with different conditions.
- **Decisions you can revisit.** Save a choice with its reasons and original conditions. Recheck sources later, compare versions, and export or import a decision as JSON.

### Laptops: see which options survive a changed requirement

Expand the budget to ¥8,000, then compare a ¥5,000 path, at least 24 GB RAM, or a tighter weight limit. The canvas keeps all matching options on their paths. Open a branch comparison to see which products drop out and the quotations behind that result.

![Prism laptop branch comparison: tightening the budget removes products with cited prices above the limit](../assets/branch-comparison-preview.png)

*The captured comparison changes 8 eligible records to 3. Its product observations are historical; it is not a current cross-platform price check.*

### Housing: watch a condition change
![A real Prism recording: changing one branch's budget updates its matching options while the original situation remains](../assets/what-if-demo.gif)

*Budget: ¥2,500 → ¥2,000 → ¥3,000. The selected branch changes from 4 → 1 → 5 matching records. This interaction recalculates saved evidence; it does not run a new search.*

## Examples

Each question shapes the comparison model: price, RAM and weight for a laptop; rent and area for housing. Both use the same Agent, evidence model and canvas.

| Start with a question | Continue exploring |
| --- | --- |
| “Find a development laptop under ¥7,000, with at least 16 GB RAM.” | “What if I need 32 GB?” · “Why did this option drop out?” |
| “Compare whole-apartment rentals in Hangzhou under ¥4,000/month, at least 30 m², with source photos.” | “What if the budget is ¥2,500?” · “Show more spacious options.” |
| An existing saved decision | “Keep this path and find more alternatives.” · “Recheck the evidence behind my choice.” |

For a ready-made canvas without a model, import an [example decision](../../examples/README.md).

**Real research check:** fresh Hangzhou and Chengdu rental tasks each returned **6 eligible listings with corresponding source photographs**, using local `qwen3.5:9b`, tofu and LangGraph. No listing URLs were supplied. These are dated observations, primarily from Fang.com; see [the full runs and their limits](../reports/AGENT-RESEARCH-REPAIR-2026-11-15.md).

<a id="agent-architecture"></a>

## Agent architecture

LangGraph runs the research Agent. The model proposes comparison dimensions, searches and reads public pages, and organizes cited choices. What-if uses that same typed model to recalculate a branch immediately when a condition changes. An explicit request for more research returns to the Agent.

```mermaid
flowchart TB
  Question["Question / follow-up"] --> Agent["LangGraph StateGraph<br/>Plan · research · recover · analyze"]
  Model["Model adapters<br/>ChatOllama / Chat Completions"] <--> Agent
  Tools["Search and public pages<br/>tofu-search / Tavily"] <--> Agent
  Agent --> Evidence["Validated decision model<br/>Fields · quotations · source photos"]
  Agent -.-> Checkpoints["SQLite checkpoints<br/>Resume research progress"]
  Evidence --> Canvas["What-if canvas<br/>Preserved baseline · scoped recalculation"]
  Conditions["Change a condition"] --> Canvas
  Canvas --> Memory["Immutable JSON versions<br/>Choices · reasons · evidence"]
  Canvas -->|Explicit request for more research| Agent
  classDef agent fill:#eaf6f1,stroke:#2b8a78,color:#173d36;
  classDef store fill:#f2f4f8,stroke:#94a3b8,color:#334155;
  class Agent,Evidence,Canvas agent;
  class Checkpoints,Memory store;
```

| Layer | Implementation | Responsibility |
| --- | --- | --- |
| Research orchestration | LangGraph `StateGraph` | Understanding, tool use, missing-evidence recovery and analysis |
| Models and tools | ChatOllama / compatible HTTP; tofu-search / Tavily | Connect local or remote models with publicly readable sources |
| Evidence validation | Zod and source/quotation validators | Check field types, units, excerpts and corresponding photographs |
| Interaction and memory | Deterministic evaluator; SQLite; JSON versions | Recalculate conditions, resume tasks and retain decision context |

<details>
<summary>View the compiled LangGraph nodes and source entry points</summary>

```mermaid
flowchart LR
  understand --> search --> read --> extract --> corroborate --> recover --> complete --> analyze
```

Research graph: [general-research.mjs](../../src/general-research.mjs). Providers: [research-providers.mjs](../../src/research-providers.mjs). Branch validation/evaluation: [decision-schema.mjs](../../src/decision-schema.mjs). Checkpoints: [jobs.mjs](../../src/jobs.mjs).

</details>

[Architecture and trust boundaries →](../ARCHITECTURE.md)

## Documentation

| Guide | What you will find |
| --- | --- |
| [Documentation index](../README.md) | All guides, project structure, media provenance and historical reports |
| [Setup](../SETUP.md) | Native installation, Ollama, search, configuration and troubleshooting |
| [Using the workspace](../WORKSPACE.md) | Conversation, conditions, evidence, decision memory, import and deletion |
| [Architecture](../ARCHITECTURE.md) | Agent graph, evaluator, persistence and trust boundaries |
| [Development](../DEVELOPMENT.md) | Tests, isolated data, live probes and Docker status |
| [Publishing](../PUBLISHING.md) · [Release notes](../releases/v0.4.0.md) | GitHub preparation and the public preview scope |
| [Verification](../reports/VERIFICATION.md) · [Roadmap](../ROADMAP.md) | Measured results and remaining release work |

## Development and verification

```sh
npm run test:release
```

Latest local verification: **173 unit/HTTP tests and 55 browser tests passed**, plus **3 real-Redis integration tests**. Controlled tests check behavior; separate live runs check actual retrieval. See [development instructions](../DEVELOPMENT.md) for Chrome/Chromium setup and individual commands.

Use `npm run check:project` to check the complete working-tree source and `npm run package:source` to create an archive excluding local settings, decision data and experiments. See [project structure and packaging](../PROJECT-STRUCTURE.md).

## Project status

Prism **0.4 is a development preview for local, single-user use**. Real research depends on the model, search engines and publicly readable sources. A saved citation records what a source said; it does not independently verify the publisher's claims.

The current live checks cover two rental tasks. Broader retrieval evaluation and cross-platform coverage remain in progress. PDF/Word/Excel/image ingestion is not implemented. Native Windows installations pass on Node 22.23.5 and 24.19.0. The first [GitHub CI run](https://github.com/mianwtt/prism/actions/runs/44038301786) also passes Windows/Linux Node 22/24 checks, browser journeys, source packaging and the Docker build/runtime smoke. See [release gates](../ROADMAP.md).

Questions and decision history are stored locally. External models, searches and source reads still receive the data needed for those requests. Read [security and privacy](../../.github/SECURITY.md) before sharing exports or running with personal information.

## Contributing

Public-source adapters, reproducible data-quality cases and accessibility improvements are welcome. Start with [CONTRIBUTING](../../.github/CONTRIBUTING.md).

Source code is [MIT licensed](../../LICENSE). Third-party content and photographs retain their respective rights.
