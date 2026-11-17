# Development and verification

[README](../README.md) · [Architecture](ARCHITECTURE.md) · [Contributing](../CONTRIBUTING.md)

Use Node 24 for the checked native path. Run `npm ci` before development. The UI uses native browser modules without a build step.

## Run checks

```sh
npm run check
npm test
npm run test:browser
```

The combined command runs these three steps sequentially:

```sh
npm run test:release
npm run test:runtime
```

The latest local run on 2026-11-17 passed **161 unit/HTTP tests and 55 browser tests**. Separate clean Windows installations on Node 24.19.0 and 22.23.5 also passed runtime checks; Node 22 passed the same 161 unit/HTTP tests. See [verification](reports/VERIFICATION.md). Controlled tests do not establish live retrieval accuracy or remote CI success.

`test:runtime` starts its own server with temporary storage, checks all declared static routes plus demo/import/export/deletion, and removes its fictional data. It never loads the checkout's `.env`. The `-- --url http://127.0.0.1:PORT` option instead checks an explicit local instance, creating and removing only its own demo roots; CI uses this for a disposable container.

### Browser setup

Tests use an installed Google Chrome by default. For Playwright Chromium, first run:

```sh
npx playwright install chromium
```

Windows PowerShell:

```powershell
$env:PLAYWRIGHT_CHANNEL = "chromium"
npm run test:browser
```

POSIX shell:

```sh
PLAYWRIGHT_CHANNEL=chromium npm run test:browser
```

Browser tests use port 4318, isolated data and controlled providers, not your normal decision workspace.

### Evidence checks

```sh
npm run evaluate:evidence
```

The labeled fictional corpus tests quotations, units, conditional prices, polarity and unsupported observations. It is not an LLM extraction benchmark. For local inference with fictional search sources, use `npm run test:agent:local`.

## Probe real research

```sh
npm run probe:research -- "your search query"
npm run test:adaptive:live -- "your research question"
```

These perform real external calls with configured providers. The adaptive command exercises the compiled LangGraph and writes model/search/read evidence under ignored `work/general-live-evaluation/`. It does not save into decision spaces. Keep failures when evaluating changes; do not replace them with selected-page replays or fixtures.

The [research repair report](reports/AGENT-RESEARCH-REPAIR-2026-11-15.md) separates seven implementation runs, their failures and the final successful rental tasks. It is a small task set, not a general accuracy estimate.

## Use separate data

Use `PRISM_DATA_DIR` for experiments. Windows PowerShell example:

```powershell
$env:PRISM_DATA_DIR = "work/my-experiment"
$env:PORT = "4320"
npm start
```

Do not attach `.env`, provider settings, checkpoints, full task histories or personal snapshots to issues. The Git-index guard checks known credential patterns and private paths; it is not a complete private-data detector.

## Source files and packaging

See [project structure](PROJECT-STRUCTURE.md) for the source map and local-data boundaries.

```sh
npm run check:project
npm run package:source
npm run check:publish
```

`check:project` checks all allowlisted working-tree source files, including new modules outside the Git index. It verifies literal relative imports, local documentation links/anchors, server asset references, dependency metadata, public template placeholders and known credential patterns. These checks complement review; they cannot identify every form of sensitive content.

`check` combines JavaScript syntax checks with that working-tree audit and also works in an extracted source archive without `.git`. Git-index checks belong to the separate `check:publish` command; publication requires an actual Git checkout.

`package:source` uses the same checked snapshot. It writes `work/releases/prism-0.4.0-source.tar.gz` and a `.sha256` sidecar, with per-file hashes in `SOURCE-MANIFEST.json`. It requires the system `tar` command. Local configuration, decision data, dependency installations and experiment outputs are excluded.

`check:publish` additionally checks the Git index. All public source files must be staged at their current content, with no obsolete or private paths. Review and stage the intended changes before using it for publication. None of these commands stages, commits or pushes files. A complete source archive does not establish that a staged commit or remote CI is complete.

## Docker

The native path is the verified installation. For contributors evaluating the container definition:

```sh
docker compose up --build
```

Compose binds to host loopback and persists data in `prism-data`. The Debian-based image builds the native SQLite dependency in a separate stage and runs the application as the `node` user with a health check. It supports the demo and a compatible model plus Tavily configuration; it does not bundle the optional tofu Python runtime. Docker Desktop currently cannot start its engine in this environment, so local container acceptance remains unverified. A separate CI job builds and exercises a disposable container; its remote result is not yet available.

Inside a container, `localhost` refers to that container, not the host Ollama. Model endpoints must be reachable from the container.

## README media

`assets/workspace-preview.png` and `assets/what-if-demo.gif` capture Prism using six saved public listing observations from 2026-11-15. The three display hypotheses were curated; they are not additional discovered housing facts. The GIF records actual controls: a branch's ¥2,500 → ¥2,000 → ¥3,000 limits yield 4 → 1 → 5 matches while the baseline retains six. Photographs come from corresponding source pages; none were generated. See [media provenance](assets/README.md).

The laptop comparison screenshot uses saved historical Suning observations, not a current cross-platform price check. These captured records are not bundled as clean-clone demo data. Startup and portable examples are explicitly fictional.

## Remaining release gates

Docker, Linux and remote GitHub CI acceptance remain unverified. Native Windows Node 22/24 installation and runtime checks have passed. See [publishing](PUBLISHING.md), [roadmap](ROADMAP.md) and the historical [release audit](reports/RELEASE-AUDIT-2026-11-10.md).
