# GitHub public preview preparation — 2026-11-17

[Publishing guide](../PUBLISHING.md) · [Release notes](../releases/v0.4.0.md) · [Verification](VERIFICATION.md)

Prism 0.4 is prepared for an initial **public preview** upload. The complete source, MIT license, bilingual README, actual interaction recording, fictional examples, setup instructions, contribution/security guidance and release notes are present. Git staging now contains the full reviewed source, rather than the earlier partial index.

## Completed in this follow-up

- Stage the complete allowlisted source and remove obsolete moved-document paths from the index. Preserve a binary index backup and staged patch under ignored `work/` before changing it.
- Add executable commit/push guards that run the complete-source publication check. Keep configuration, decision histories, dependency installations and local experiment data out of Git.
- Add an isolated runtime smoke for health, SQLite startup, every declared static route, laptop/housing demos, export/import and deletion. The normal command uses temporary storage and never loads the checkout's `.env`.
- Make normal syntax/source checks work in a downloaded source archive without Git metadata. Keep the strict staged-file check in `check:publish` and local Git guards. Syntax subprocesses resolve the actual project root rather than depending on the caller's current directory.
- Serialize source archive builds with an exclusive publication lock so competing commands cannot mix an archive with another build's checksum. The archive regression checks that a blocked competing build leaves the verified artifact intact.
- Verify a clean Node 22 installation with its own native SQLite binary. Reusing Node 24's existing binary fails with an ABI mismatch; that probe was not counted as compatibility acceptance. The later independent installation passes.
- Require Node 22.9+ because startup uses [`--env-file-if-exists`](https://nodejs.org/download/release/v22.23.0/docs/api/cli.html#--env-file-if-existsfile). Recommend Node 24, add `.nvmrc`, keep Playwright and its driver pinned together, and explicitly allow the required SQLite install script in npm versions supporting that policy.
- Add the publishing guide, public-preview release notes, feature-request template and dependency-update configuration.
- Update CI to exact official action release tags: [checkout 7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node 7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0), [upload-artifact 7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2). Disable persisted checkout credentials. Add native runtime smoke and a separate container build/smoke job.
- Prepare a Debian-based multistage container definition with native build prerequisites, a nonroot runtime user and a health check. This is configuration work; it is not a claim of a successful local container run.

## Verification

| Profile | Result |
| --- | --- |
| Windows / Node 24.19.0, full release command | 161 unit/HTTP tests and 55 browser tests passed |
| Windows / Node 24.19.0, isolated runtime smoke | Passed: health, SQLite, 24 static routes, demos, import/export and deletion |
| Windows / Node 22.23.5, clean independent installation | `npm ci` passed, separate native dependencies installed |
| Windows / Node 22.23.5, source and publication checks | Passed in the independent prepared checkout |
| Windows / Node 22.23.5, unit/HTTP and runtime smoke | 161 tests passed; isolated runtime smoke passed |
| Original repository complete-source publication check | Passed after reviewed staging; no missing current-source or obsolete staged paths |
| Final downloaded archive without `.git` | Clean install, normal source check, all 161 unit/HTTP tests and runtime smoke passed; strict publication correctly refuses a directory without Git metadata |
| Archive and privacy | All 200 source members match their manifest and working-tree bytes; all 52 snapshotted local files (`.env` and 51 JSON files) are unchanged |
| Final canvas/dialog cleanup | Six targeted browser journeys passed; staged whitespace check passed |
| GitHub YAML and Compose definitions | Four YAML files parsed; workflow job structure and Compose configuration checked |
| Dependency install audit | Zero known vulnerabilities reported by npm at the time of the installation |

Final cleanup removes only extra blank lines at the end of three browser modules. Their nontrailing contents are identical; related canvas/dialog browser journeys were rechecked. After the final documentation update, archive integrity is checked again and code/dependency hashes are compared with the clean smoke-tested snapshot.

Detailed logs and the previous staging selection are retained under ignored `work/github-ready-2026-11-17/`. All 52 local files snapshotted before preparation, including `.env` and 51 JSON files, are preserved. No real-data fixture or synthetic photograph was substituted for live retrieval acceptance.

## Publication boundaries

This is prepared source, not an uploaded repository. The checkout has no configured remote or Git author identity, and no commit, push or tag was fabricated. The owner can use the [publishing guide](../PUBLISHING.md) with their actual repository and author details.

Local Docker acceptance remains unavailable: the Desktop CLI reports an inactive engine, and Docker requests return “Docker Desktop is unable to start.” A bounded start attempt did not recover it. No existing container, WSL distribution, proxy setting or Docker data was reset. Containers stay experimental until the separate CI smoke passes.

Remote Linux and GitHub CI have not run. Inspect those actual results after the first push before publishing a prerelease. This preparation does not add document ingestion or broaden the measured live-research task set; [the actual research results](AGENT-RESEARCH-REPAIR-2026-11-15.md) retain their original scope and failures.
