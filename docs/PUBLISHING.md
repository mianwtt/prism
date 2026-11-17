# Publishing Prism

[Documentation](README.md) · [Development](DEVELOPMENT.md) · [0.4.0 release notes](releases/v0.4.0.md)

The first public distribution is **Prism 0.4, a local single-user preview**. Its differentiator is the connected experience: research produces cited choices; What-if branches change those choices; conversation and saved reasons stay with the decision. It is not presented as a verified autonomous purchasing service or a hosted multi-user product.

## Validate the candidate

Use Node 24 (recommended) or a current Node 22 release, at least 22.9. Changing the Node major version requires a fresh `npm ci` because SQLite includes a native binary. Use a separate checkout for each major version.

```sh
npm ci
npm run test:release
npm run test:runtime
npm run package:source
```

The runtime smoke starts an isolated server and removes only its temporary fictional data. Do not substitute a successful fictional demo for real research acceptance. The [real research report](reports/AGENT-RESEARCH-REPAIR-2026-11-15.md) records the measured rental tasks and their limitations.

## Prepare the Git commit

Keep `.env`, `data/`, `work/`, dependency installations and test artifacts private. The public `.env.example` uses `XXX`; do not replace those public placeholders with credentials.

Review and stage the intended source changes. Then run:

```sh
npm run check:publish
git diff --cached --stat
git diff --cached --check
```

The publication check rejects missing current source, obsolete staged files, working/staged differences, private paths and recognized credential patterns. It is a source check, not a complete sensitive-information detector. Review the staged diff as well.

Optional local commit/push guards:

```sh
git config core.hooksPath .githooks
```

Git clones preserve the hook executable bits. On POSIX systems using downloaded source instead of a Git clone, first run `chmod +x .githooks/pre-commit .githooks/pre-push`. Hooks run the same publication check before a commit or push; GitHub CI checks the committed checkout independently.

Commit with the owner's configured Git name and email. A GitHub privacy email can be used. No project script invents an author identity or uploads a token.

## Repository setup

Create the destination repository under the intended owner. Connect that exact URL as `origin`, then push the reviewed commit to `main`. Repository creation, authentication, pushing and release publication are separate from preparing this source tree; never put a personal access token in a remote URL or committed file.

Suggested repository description:

> An AI research agent with an interactive What-if canvas. Explore cited choices, continue the conversation, and remember why you decided.

Suggested topics: `ai-agent`, `langgraph`, `what-if`, `decision-support`, `local-first`, `ollama`.

Enable Issues and optional private vulnerability reporting. MIT is already selected. The README includes an actual interaction recording, dated real-source screenshots, fictional examples and explicit research limits.

## First push and release

The Checks workflow covers Windows/Linux Node 22/24, browser journeys, source artifacts and a container smoke. Inspect its actual results after the first push. Local validation does not establish that a remote job has run.

Publish the [release notes](releases/v0.4.0.md) as a **prerelease** after the required native and browser jobs pass. Container distribution remains experimental until its own CI smoke passes. Attach the checked source archive and SHA-256 sidecar from `work/releases/`; configuration and decisions are not release assets. Do not label the preview a mature V1 or advertise unsupported document ingestion or universal listing coverage.
