# Development and verification

[README](../README.md) · [Architecture](ARCHITECTURE.md) · [Contributing](../.github/CONTRIBUTING.md)

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

The latest local run on 2026-11-17 passed **173 unit/HTTP tests and 55 browser tests** on Node 24, plus **3 isolated real-Redis integration tests**. Earlier separate clean Windows installations passed on Node 24.19.0 and 22.23.5; the earlier Node 22 run covered 161 unit/HTTP tests. See [verification](reports/VERIFICATION.md). Controlled tests do not establish live retrieval accuracy or remote CI success.

The optional cache integration runs separately with `npm run test:cache:redis` and an explicit `PRISM_TEST_REDIS_URL`. It requires a real Redis, uses only its own scoped keys and does not call live search/model services. See the [technical report](TECHNICAL-REPORT.md).

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

Native Windows/Linux checks and the container build/runtime smoke passed in [the first GitHub CI run](https://github.com/mianwtt/prism/actions/runs/44038301786). To run the container locally:

```sh
npm run docker:up
```

Deployment configuration lives in `deploy/docker/`. `npm run docker:config` checks Compose configuration and `npm run docker:down` stops this Compose project without removing its named volume. Direct builds use `docker build --file deploy/docker/Dockerfile --tag prism .` from the project root. The adjacent `Dockerfile.dockerignore` excludes local settings, data and experiments from the build context.

Compose binds to host loopback and persists data in `prism-data`. The Debian-based image builds the native SQLite dependency in a separate stage and runs the application as the `node` user with a health check. The Linux CI container job passed build, startup, all 24 static routes, demos, import/export and deletion. It does not bundle the optional tofu Python runtime; live research inside the container has not been separately evaluated. Docker Desktop still cannot start its engine on the development machine, so that local Desktop path is not claimed to have passed.

Inside a container, `localhost` refers to that container, not the host Ollama. Model endpoints must be reachable from the container.

## README media

`assets/workspace-preview.png` and `assets/what-if-demo.gif` capture Prism using six saved public listing observations from 2026-11-15. The three display hypotheses were curated; they are not additional discovered housing facts. The GIF records actual controls: a branch's ¥2,500 → ¥2,000 → ¥3,000 limits yield 4 → 1 → 5 matches while the baseline retains six. Photographs come from corresponding source pages; none were generated. See [media provenance](assets/README.md).

The laptop comparison screenshot uses saved historical Suning observations, not a current cross-platform price check. These captured records are not bundled as clean-clone demo data. Startup and portable examples are explicitly fictional.

## Remaining release gates

Windows/Linux Node 22/24, browser regression, source packaging and the basic container smoke passed remote CI. Broader live-research evaluation, document ingestion and usability work remain in the [roadmap](ROADMAP.md). See [publishing](PUBLISHING.md) and the historical [release audit](reports/RELEASE-AUDIT-2026-11-10.md) for the respective scopes.
