# Project file preparation — 2026-11-17

[Documentation](../README.md) · [Project structure](../PROJECT-STRUCTURE.md) · [Verification](VERIFICATION.md)

This preparation organizes the repository and makes its complete working-tree source reviewable and portable. It does not change the existing canvas, active research implementation or user decisions.

## Directory changes

Four screenshots/recordings moved into `docs/assets/`, six existing verification/research reports moved into `docs/reports/`, and the earlier mixed Agent implementation notes moved into `docs/legacy/AGENT-0.4.md`. Links in both READMEs and the guides were updated. The documentation index, source-directory guide and current adaptive Agent guide now distinguish active behavior from historical implementation notes. README media provenance explicitly distinguishes saved source observations, curated hypotheses and fictional portable demos.

The runtime still uses `src/` and `public/` directly. No mass import rewrite, frontend rebuild or data migration was introduced.

## Complete source checks

`npm run check:project` checks all allowlisted public source files, including untracked modules. It validates required entry files, parsed literal ESM imports, local Markdown/HTML links and anchors, server static assets, package/lock metadata, public provider placeholders and recognized credential patterns. Module parsing uses the pinned development dependency `es-module-lexer`; code examples in strings and comments are not treated as imports. Known-pattern scanning complements review and is not a complete detector for private information.

`npm run check:publish` additionally compares the actual Git index with the complete working-tree source. It rejects missing files, obsolete staged paths, conflicts, staged symlinks and content differences. Neither command changes the Git index.

`npm run package:source` archives the checked bytes into `work/releases/prism-0.4.0-source.tar.gz`. Each included file has a size and SHA-256 in `SOURCE-MANIFEST.json`; the archive has a `.sha256` sidecar. Configuration, personal data, dependencies, experiments and generated test output are excluded. Source links and redirected output directories are rejected. The system `tar` executable is required.

CI definitions now include complete-source publication checks and an uploaded source artifact. These definitions have not run remotely and do not constitute release acceptance.

## Local verification

Environment: Windows, Node 24.19.0, npm 11.17.0, Google Chrome.

| Check | Result |
| --- | --- |
| JavaScript syntax, staged credential guard and working-tree source audit | Passed |
| Unit/HTTP regressions | 161 passed, including seven new publication tests |
| Browser regressions | 55 passed |
| Archive member list, byte contents and manifest/checksum integrity | Passed |
| Clean extracted-source installation outside the original Git checkout | Plain `npm ci` passed |
| Independent native server startup and health | Passed, separate storage and no private provider configuration |
| All declared static routes | 24 returned HTTP 200 |
| Laptop demo and housing demo | Both created successfully |
| Housing decision export/import | Passed with a new imported root |
| Housing deletion | Removed the decision JSON from the isolated disk directory |
| Preservation | Original `.env`, 51 existing JSON files (52 local files total) and Git staged-content inventory unchanged |

The archive smoke check uses the same native server command as `npm start`; it selects an unused local port and independent storage. Its child server was stopped after the check. Existing user preview servers were untouched. Only documentation changed after the smoke-tested archive; the final archive's code/dependency hashes are checked against that tested snapshot.

## Remaining publication work

The original checkout contains an earlier partial staging selection. Strict `check:publish` fails there because new source files are missing and older staged bytes differ. This is an expected protection: the existing selection was preserved, not silently replaced. The source archive packages the complete checked working tree rather than relying on that selection.

There was no commit, remote creation, push or published release. Docker, clean Node 22, Linux and remote CI remain unverified. This preparation does not establish broader live research accuracy or fresh listing prices; consult the separately dated [real research report](AGENT-RESEARCH-REPAIR-2026-11-15.md).

Detailed local evidence is retained under the ignored `work/project-layout-2026-11-15/` directory: the directory-move inventory, before/after preservation hashes, full release-test log, publication-check diagnostics and clean-source installation/API results. Private logs and data are not included in the source archive.
