# Project structure

[Documentation](README.md) · [Development](DEVELOPMENT.md)

Prism runs directly from its source files. The browser uses native JavaScript modules; there is no frontend build output to maintain.

```text
prism/
├── src/                  Local HTTP API, Agent, evaluator and storage
├── public/               Browser modules, styles and existing SVG assets
├── scripts/              Diagnostics, search setup, retrieval probes and packaging
│   └── lib/              Source audit and archive helpers
├── tests/                Unit, HTTP and browser regression coverage
│   └── browser/          Browser journeys and their Playwright configuration
├── examples/             Portable, explicitly fictional decisions
├── deploy/
│   └── docker/           Dockerfile, Compose and Dockerfile-specific context exclusions
├── docs/
│   ├── assets/           README screenshots and actual interaction recording
│   ├── i18n/             English README; Chinese remains the default root README
│   ├── reports/          Dated verification and research evaluations
│   ├── releases/         Public preview release notes
│   └── legacy/           Historical implementation notes
├── .github/              CI, contribution templates, contributing and security policies
├── .githooks/            Local publication credential guard
├── .env.example          Public configuration template using XXX placeholders
├── .nvmrc                Recommended Node major for native development
├── README.md             Chinese product introduction with a visible English link
├── LICENSE               MIT license
├── package.json          Runtime dependencies and commands
└── package-lock.json     Locked dependency graph
```

## Find the implementation

| Responsibility | Entry points |
| --- | --- |
| Local server and API | `src/server.mjs` |
| Adaptive research and public source reading | `src/general-research.mjs`, `src/general-retrieval.mjs`, `src/public-rental-read.mjs` |
| Model and search adapters | `src/research-providers.mjs` |
| Typed conditions and deterministic evaluation | `src/decision-schema.mjs` |
| Conversation and decision memory | `src/decision-workflow.mjs` |
| JSON snapshots and SQLite research checkpoints | `src/store.mjs`, `src/jobs.mjs` |
| Canvas, condition controls and detail modal | `public/branch-canvas.mjs`, `public/universal-view.mjs` |

Older laptop modules stay available for saved snapshots. New research uses the adaptive model described in [the Agent guide](AGENT.md).

## Repository front page

The root contains nine tracked files: the README, license, package metadata and configuration files that tools expect at the root. Deployment files are in `deploy/docker/`, the browser configuration is beside the tests, search requirements are under `scripts/`, and GitHub community policies are in `.github/`. The English README is under `docs/i18n/`; the identical extra Chinese README was removed.

Docker commands remain available from the project root as `npm run docker:up`, `npm run docker:down` and `npm run docker:config`. The Compose project name stays `prism`, preserving the existing named-volume identity.

## Local files stay local

- `.env` and `data/provider-settings.json` contain private provider configuration.
- `data/` stores local decisions, versions, source snapshots and research state.
- `work/` stores isolated previews, local search installations, experiments and generated archives. A preview can select its own directory with `PRISM_DATA_DIR`.
- `node_modules/`, `test-results/`, `playwright-report/` and Python caches are generated locally.

These directories are ignored by Git and excluded from source archives. Moving documentation does not migrate, reset or delete existing decisions or configuration.

## Check and package source

```sh
npm run check:project
npm run package:source
```

The first command checks the complete allowlisted working-tree source, including new files that have not been staged. It checks required files, literal module imports, local documentation links and anchors, static asset references, dependency metadata and known credential patterns. Public provider-template values must be `XXX`.

Packaging uses that checked snapshot and writes `work/releases/prism-0.4.0-source.tar.gz` with a SHA-256 sidecar. Its `SOURCE-MANIFEST.json` lists every included file's size and hash. This is a source snapshot, not a signed release or proof that remote CI passed. The command requires the system `tar` executable and never stages, commits or pushes files.

Before publishing a Git commit, run `npm run check:publish`. It additionally requires the Git index to contain the same complete source snapshot. An incomplete or older staging selection fails without being changed. See [development](DEVELOPMENT.md).
