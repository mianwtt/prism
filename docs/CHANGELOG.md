## System architecture overview — 2026-11-22

- Make the main Chinese and English README diagram a compact system overview with four groups: workspace, decision service, models/sources and local data/cache. Keep Node.js, specialist research, evidence checks and What-if inside their owning component.
- Keep the specialist workflow as an expandable subsystem detail rather than presenting it as the entire system architecture. Add the same overview to the architecture guide and retain existing section anchors.
- Clarify browser-local What-if evaluation, browser drafts, JSON business/job records, SQLite research checkpoints and search-only optional Redis caching.
- Review the original AutoGen, AgentScope and OpenHands framework figures for presentation references; retain detailed component tables and specialist diagrams in expandable sections.

## Multi-agent README and architecture presentation — 2026-11-22

- Expose all four implemented specialist roles in the Chinese and English README with matching vector architecture diagrams, concrete laptop handoffs and links to source contracts.
- Distinguish role count from model count, tool-call count and execution stages. Document sequential shared-model execution, program authority over eligibility, bounded repair and explicit review degradation.
- Use normal body text for all README screenshot captions instead of Markdown emphasis.
- Recheck the synchronized implementation with 299 unit/HTTP tests and 71 Microsoft Edge browser regressions; inspect both vector diagrams and validate the Mermaid source diagrams before publication.

## Coordinated specialist subgraphs — 2026-11-21

- Run coordinator, researcher, independent evidence reviewer and analyst as compiled LangGraph subgraphs with projected task contexts and role-scoped adapters. Existing What-if computation and ordinary conversation routes retain their behavior.
- Preserve grounded review holds through the bounded recovery handoff; a disputed observation cannot silently reappear through re-extraction or the public-price fallback. Model review may withhold facts, not invent replacements or change requirements.
- Record role/phase calls, character counts, durations, review coverage and explicit degraded-review status. Keep sequential execution and one bounded repair round; do not claim parallel performance or accuracy gains.
- Pass 299 unit/HTTP tests and 71 Edge regressions. A fresh actual-model Binjiang run yields seven eligible source-photo listings; review completes, and rent 3000 recalculates seven to two. See [the implementation and evidence](MULTI-AGENT.md).

## Interaction routing and usage follow-through — 2026-11-21

- Separate research, deterministic What-if and existing-evidence explanations in both README diagrams. Document providers, checkpoints, business snapshots and caches as dependencies with different roles rather than serial user steps.
- Retain validated same-origin workspace drafts across navigation and refresh. Export current unsaved canvas conditions instead of silently exporting an older version; deleting a family also clears its browser drafts.
- Keep baseline filter controls available after clearing a zero-weight limit, and execute exact categorical short replies such as “还是整租吧” before model prose.
- Resolve over-specific rental city inputs through observed city-index labels. A fresh Beijing Haidian task recovers from zero to six fully qualifying source-photo records; this is targeted regression evidence, not general search accuracy.
- Preserve 293 passing unit/HTTP checks, 71 Edge browser regressions and 11 real-service usage checks. See the [usage report](reports/USER-JOURNEY-2026-11-21.md) for failures, the interval limitation and verification scope.

## Rental district compliance — 2026-11-20

- Preserve city/district metadata from the same native listing identity; never infer location from an advert, a development name or recommended listings.
- Reach a district catalog through an actual observed listing breadcrumb, and prevent later catalog filters from silently broadening the selected district back to the whole city.
- Bind an explicit requested region to a source-grounded enum constraint and preserve it across What-if, dialogue, imports and source rechecks. Unknown/outside districts do not count toward research completion. Unresolved regional discovery keeps evidence as drafts rather than recommending city-wide substitutes.
- Add district checks to independent task acceptance. Two fresh Edge homepage research runs for the same Hangzhou Binjiang request yield 6 and 7 fully qualifying source-photo records, respectively; lowering rent to 3000 yields 1 and 2 while preserving the baseline. These are targeted regressions, not general discovery success-rate claims.
- Verify 285 unit/HTTP tests, 66 Edge browser regressions and five real-data Edge interactions. See the [regional compliance report](reports/RENTAL-GEOGRAPHY-2026-11-20.md) for before/after evidence and limitations.

## Real-interface usage simulation and follow-up fixes — 2026-11-20

- Replay everyday language through Microsoft Edge using copies of existing source-backed decisions and the actual model. Start one real rental research task from the homepage, then inspect its sources and original photographs. No research/model responses are substituted in these usage simulations.
- Respect explicit requests to explain without changing conditions; calculate the proposed threshold separately and describe the actual current settings instead of copying another branch's history.
- Recognize another increment, corrections that negate an earlier value, and removal requests that mention the old threshold. Resolve typed operations before generating action-result prose.
- Keep user navigation when a pending reply finishes, including navigation to another space or the homepage. Preserve each response's original path association and pause condition editing while that conversation is being applied.
- Validate semantic field synonyms against the quoted request, retain grounded user vocabulary, and apply a common supported edit without accepting unrelated proposed removals. This fixes generated “月租金” fields receiving later “月租” requests.
- Independently review geographic requirements: the pre-fix “杭州滨江” discovery returned six source-photo records, but a source explicitly naming 拱墅 was still admitted. This was a release blocker; source/record counts and successful What-if replays did not pass the original task. The subsequent district repair and fresh research results are documented above.

## Contextual conversation and reversible actions — 2026-11-20

- Separate typed condition changes, removing a limit, clarification answers and undo. Keep schema-selected fields generic across laptop, housing and other decisions; never infer new numeric constraints from old messages.
- Persist the active field and pending question. Support short follow-ups such as “32G呢”, “如果没有要求呢” and “第一个”; scope pending answers to their original path and reject expired choices.
- Execute validated semantic model actions through the same application evaluator. Preserve specific questions, and prevent an unrelated model question from overriding a valid targeted change. Display actual counts rather than model-written claims of success.
- Add effect-derived clarification choices, concise condition chips with removal controls, result navigation and undo receipts. Keep unchanged explanatory replies free of redundant path buttons. Preserve baseline conditions, source records, real source images and historical branches.
- Undo returns to the prior path and folds the undone subtree without deleting history; refuse to overwrite later manual edits. Export/import validates and retains conversational context and operation snapshots.
- Route model-recognized requests for new evidence into the actual adaptive research job, including when the sentence does not contain a fixed search verb. Explanations alone do not launch research.
- Pass 268 unit/HTTP tests and 63 Microsoft Edge browser tests, with final targeted conversation/HTTP and 12 Edge regressions after the last refinements. Visually inspect desktop and mobile views using copies of existing source-backed decisions.
- Three small real-model checks on a fictional housing fixture cover semantic clearing, an explanation without edits and a missing-evidence research request. These are interaction checks, not a live-search recall measurement. Numeric intervals still require both-bound support in the underlying decision model and are not silently applied.

## Conversational condition targets — 2026-11-20

- Fix requests such as “如果降低预算到5000以内呢”: recognize verbs before or after a field name and distinguish an absolute target (“减少到5000”) from a relative change (“减少1000”). Keep typed unit conversions and the original situation intact.
- Recognize a request for the condition already active; explain the existing threshold and eligible choices without calling the model or creating a duplicate branch.
- Separate conversation path navigation from continued conversation: close history, reveal hidden ancestors, pan to and highlight the destination, and preserve zoom, evidence and saved conditions. Both desktop and narrow-screen tests cover the route back to the baseline.
- Reject unsupported numeric intervals with an explicit clarification and the actual active conditions; do not let model text claim that an unapplied 6000–7000 budget range changed the decision or partially apply other fields.
- Add regression coverage for the exact reported sentence through the actual HTTP conversation and Edge canvas, including saved history, matching image nodes and unchanged source records. This change does not establish improved live-search recall.
- Local Windows/Node 24 validation passes 251 unit/HTTP tests, 59 Microsoft Edge browser tests, syntax and complete-source checks.

## Configuration diversity and preview verification — 2026-11-19

- Group only source-supported matching configurations; retain other colour/merchant observations without mixing quotations or changing the baseline and sibling scopes. Explicit different-configuration requirements also gate research completion.
- Distinguish phone RAM from storage, normalize enum option representation and identity metadata, and recognize source-photo requirements without inserting made-up facts.
- Run the existing explicit-priority filter before schema validation; an unsolicited invalid dimension no longer rejects valid requested thresholds. Retain anchored fields and do not manufacture enum options.
- Retry transient initial catalog reads once, allow three observed rental-filter steps, and feed fresh exclusions, rejected duplicate requests and observed specifications back into bounded Agent recovery. Recovery shares two additional discoveries and four rewrite/repair turns.
- Generate match/unresolved counts from the deterministic evaluator rather than free-text model claims. Keep source-bound interpretation separate.
- Suggest condition values from acquired facts and saved hypotheses; preserve free numeric input, live sliders and the next click after input blur. Keep the approved canvas layout.
- Pass 235 unit/HTTP tests and 56 Microsoft Edge browser regressions. Current live cohorts, retained failures and clean-source verification are documented separately in the [quality report](reports/PREVIEW-QUALITY-2026-11-18.md); do not combine task results across graph versions or substitute a successful replay for autonomous research.

## Observed discovery and plan normalization — 2026-11-18

- Discover rental cities through the observed public city index; let the Agent follow two consecutive same-city catalog filters. Apply validated product price ceilings through real platform controls and retain the observed filtered URL.
- Isolate ordinary main prices from final/coupon prices, support the explicit 易购价 layout, reject deposits and conflicting price observations, and keep parameter/gallery binding on the same product identity.
- Restore whitespace-equivalent request quotes, derive only unambiguous supported quantities, accept equivalent square-metre units, and separate process/identity metadata from decision criteria. Keep original thresholds and source quotations.
- Feed exclusion reasons and observed ranges back into bounded recovery; web searches and native catalog discoveries share a two-call discovery cap. Do not reject unread details merely because their catalog summaries omit parameters.
- Preserve complete 3/10 and 7/10 fixed-task cohorts; the final frozen graph-version-13 cohort passes 10/10 with 51 qualifying source records and 51 loaded source images. This is regression acceptance after debugging, not holdout accuracy. Same-model colour variants still limit candidate diversity; do not equate record counts with distinct hardware-model counts. See [the discovery report](reports/AGENT-DISCOVERY-2026-11-18.md).
- Verify 217 unit/HTTP tests, 55 browser tests, 35 controlled quotation cases, isolated runtime smoke, syntax and working-tree source checks. Docker and remote CI are not newly verified.

## Public merchant reading and fixed-task acceptance — 2026-11-18

- Add an Agent-selected public merchant catalog tool and same-product price/specification/gallery reader, without seeding brands or imposing the legacy laptop schema. Reuse structured reads during initial collection and recovery; withdraw stale merchant observations on source refresh.
- Separate source-link/photo metadata from decision criteria, support explicit rental-type labels and repair omitted/overlong catalog selections with one bounded model turn.
- Add ten predefined live tasks with an independent requirement checker, process/time budgets, runtime fingerprints and source-image loading checks. Preserve diagnostics and the original ten-task batch; stricter review passes 2/10 after finding an omitted application-eligibility gate. A later four-task rerun passes the 1TB computer and Beijing rental tasks (2/4), with five and four usable source-photo records respectively.
- Retain outstanding low-budget/high-memory computer and Shanghai/Shenzhen discovery failures. See [the full protocol and results](reports/LIVE-ACCEPTANCE-2026-11-18.md); this is not a mature-release acceptance pass.
- Final local regression passes 201 unit/HTTP tests (serial rerun after one Windows `ENOBUFS` failure), 55 browser tests and syntax/source checks. The final primary-price DOM compatibility change has a known-page probe, not a new full live cohort.

## Evidence recovery and rental discovery — 2026-11-18

- Reuse observed same-origin catalog links, including relative Markdown targets, before searching again. Batch detail extraction, bound retries across catalogs and save recovery diagnostics without adding a process panel.
- Recognize public mobile rental filters and topic catalogs while preserving redirect/identity restrictions. Bind explicit monthly-rent fields with currency-only display units without accepting annual, weekly or unspecified amounts.
- Add paired recovery replay tooling and thirteen recovery regressions, plus catalog/monthly-unit regressions. Local verification passes 188 unit/HTTP tests, 55 browser tests and the 35-case evidence corpus.
- Preserve two failed live attempts and a final 76.986-second Hangzhou task with six eligible records, twelve cited fields and six loaded source-bound photographs. See [recovery evidence](reports/AGENT-RECOVERY-2026-11-18.md); the controlled cases and limited live runs are not a general Agent success rate.

## GitHub public preview candidate — 2026-11-17

- Prepare the complete reviewed Git index, preserving its earlier selection in an ignored backup; add executable commit/push guards and resolve the incomplete-publication-source gate.
- Verify independent Windows Node 22/24 installations and runtime checks. Require Node 22.9+ for startup, recommend Node 24, pin the Playwright driver and record SQLite's required install script.
- Add a portable isolated runtime smoke and native/container CI coverage, exact action release references, dependency-update configuration, a feature-request template and preview publishing/release guides.
- Prepare a Debian multistage container with native build tools, nonroot execution and a health check. Local Docker remains unverified because the Desktop engine cannot start; no remote CI or release is claimed.
- Reconfirm 161 unit/HTTP tests and 55 browser tests on Node 24, plus 161 unit/HTTP tests and runtime smoke on clean Node 22. See [GitHub preparation](reports/GITHUB-READY-2026-11-17.md).

## Source and documentation preparation — 2026-11-17

- Organize screenshots/recordings, dated reports and historical Agent notes under `docs/assets`, `docs/reports` and `docs/legacy`; update local references and add documentation and source-directory guides.
- Describe the active adaptive Agent separately from historical laptop compatibility behavior.
- Add complete working-tree source checks, strict Git-index publication checks, and a source archive command with file hashes and a checksum sidecar. Keep private settings, decisions and experiments outside the source archive.
- Add seven publication regressions and a CI source-artifact definition. Local Windows/Node 24 regression passes 161 unit/HTTP tests and 55 browser tests; a clean extracted-source installation and runtime smoke check also pass.
- Preserve the existing local configuration, decisions and staged Git selection. Original Git-index completeness and unverified release environments remain publication work. See [the file preparation report](reports/PROJECT-FILES-2026-11-17.md).

## Autonomous research repair — 2026-11-15

- Separate photo provenance from comparison criteria; normalize nested model plans without relaxing quoted constraints. Prefer compact catalog discovery, then inspect observed detail links, and recover when too few complete alternatives exist.
- Read public desktop/mobile rental pages, decode legacy Chinese encodings, preserve decimal areas and bind only the main listing gallery. Reject login/verification redirects, mismatched listing identities and inconsistent primary data.
- Accept equivalent square-metre units. Preserve explicit photo requirements across follow-ups, and retain text-only records as research drafts when original photographs are required.
- Show validated Agent-suggested branches immediately and retain them during later research.
- Final fresh Hangzhou/Chengdu tasks each returned six eligible listings with corresponding source photos. All seven implementation runs and remaining limits are recorded in [the repair report](reports/AGENT-RESEARCH-REPAIR-2026-11-15.md); 154 unit/HTTP and 55 browser regressions pass.

## Local pre-release audit — 2026-11-10

- Rebind rental photographs during source refresh; withdraw current photographs when a fresh source cannot establish their identity. Keep historical snapshots unchanged.
- Restrict rental images to the listing's main gallery; reject inconsistent structured identity/price data. Read observed public catalog links and explicit rental-type values without estimating commute time.
- Validate photo/provenance requirements separately from comparison dimensions; add a bounded recovery step for zero-candidate research. Controlled regressions pass; three live housing attempts still failed acceptance.
- Correct detail-button ARIA state and text contrast, and honor reduced-motion preferences.
- Record full regression, API, clean-install, accessibility and live-research evidence in [the release audit](reports/RELEASE-AUDIT-2026-11-10.md). Formal release acceptance remains blocked; no release has been published.

## Local 0.4 publication preparation — 2026-11-09

- Delete a whole decision from the sidebar or workspace menu, with a confirmation dialog. Remove all local versions, conversations, source snapshots, related job files and SQLite checkpoint threads; refuse deletion during related running research, and serialize deletion against version saves to prevent resurrection. Preserve independent decisions and shared settings/assets.
- Keep the rental interaction fixture explicitly fictional and without listing photos. Withdraw generated housing images. Add anonymous public rental-detail reading with source-bound indoor photographs and quoted prices, areas and station distances; never estimate commute minutes without route evidence.
- Fix ancestor condition edits leaving stale descendant results and connecting lines. Persist explicit overrides, propagate inherited conditions through the subtree, preserve intent across save/import/undo, and redraw the full subtree during slider input. Empty continuations fold into branch history; explicit relaxations that restore matches stay visible and labeled.
- Portable JSON decision import with bounded schema/reference/branch validation, new-root IDs and no inherited human confirmation authority.
- Native first-run diagnostic (`npm run doctor`) and optional model connectivity probe without inference.
- English/Chinese product README, architecture/trust-boundary documentation, contribution/security guidance and MIT license.
- Portable fictional laptop/housing examples with three branches each.
- CI definitions for Node 22/24 on Windows/Linux and isolated Chromium regression runs.
- Explicit shutdown releases speculative sockets and is idempotent during recovery tests.

This entry describes local work, not a published release or a claim that retrieval quality and container distribution have passed V1 acceptance.

# Changelog

## 0.4.0 — 2026-11-03

- Put the selected scenario's image/parameter cards inside its connected result node. Remove the separate product strip; keep other branches compact and switch their cards on selection.
- Separate the workspace into scenario, evidence and research-history tabs. Collapse score details and budget thresholds, and open condition editing explicitly instead of displaying every control and report at once.
- Add source/text/parameter coverage and a dedicated supplement-search action, distinct from rereading existing URLs.
- Add focused per-candidate extraction and bounded rereads of short pages. Planning context prioritizes parameter-rich specs rather than giving all pages the same tiny excerpt budget. Quote recovery locates original numeric/unit passages inside an already cited page and retains the model's original wording for audit; it never confirms a fact automatically or recovers prices.
- Correct false rejection of short numeric citations and RAM/storage pairs such as 24GB/512GB. Reject explicitly contradictory RAM/storage configurations across candidate and source titles.
- Supplement existing targets with one assigned query per candidate (up to three); preserve settings, scenarios and assumptions, namespace new citation IDs, and save a linked version. Conflicts with reviewed values remain unresolved.
- Prioritize recognized official model pages for images even without the word “official” in their title, and allow image retrieval independently of numeric-field extraction. Missing images remain explicit.

## 0.3.0 — 2026-11-02

- Make What-if the main workspace: a connected baseline → condition branches → outcomes canvas with selection, zoom, pan and up to six independent scenarios.
- Add visual candidate cards, winner/eligibility changes, baseline/current score bars, explicit changed conditions and versioned scenario persistence.
- Add source-by-source parameter comparison with verbatim quotations, missing coverage, rejected extractions and numeric disagreement preservation. New research can return multiple observations for a fact; source count alone is not cross-validation.
- Retrieve optional public HTTPS page-image metadata through local search, with bounded reads and private-address checks. Bind images to candidate cards only when a recognized brand's official domain and source-title model family agree. Images retain page provenance, remain configuration-unverified and do not affect scores. Missing images stay explicit.
- Refresh source snapshots and optional images together. A changed secondary citation also withdraws confirmation.
- Demonstrate branch behavior with explicitly fictional products and two synthetic documents per candidate. Real-source screenshots retain unknown facts and blocked outcomes instead of inventing rankings.

## 0.2.1 — 2026-11-02

- Separate missing evidence, cited but unreviewed values, ambiguous data and confirmed parameters; show a coverage summary and concrete ranking blockers.
- Check number/unit pairs; reject multi-option memory, starting/reference prices and battery capacities presented as hours. Preserve rejected extractions for inspection.
- Reject quoted subsidy/coupon/trade-in prices pending eligibility review. Collapse identical proposed configurations; conflicting extracted values remain unknown with both quotations preserved.
- Add an explicit, versioned provisional calculation mode. It never fills missing values or changes evidence status; automatic research always starts in reviewed-only mode.
- Show AI-proposed parenthetical configurations separately from candidate labels; identify laptop OS and development compatibility as unverified.
- Add an explicit action to set battery scoring to zero when users choose not to compare missing battery hours; improve table text size and wrapping.
- Preserve historical records. Legacy data receives the same calculation checks and explanatory display without rewriting stored snapshots.

## 0.2.0 — 2026-11-02

- Research task history, SQLite graph checkpoints, synchronous node persistence and explicit recovery after service interruption.
- Source refresh jobs with persisted per-source progress, new decision versions and conservative invalidation of source-backed confirmations.
- Manual original-quote binding for corrected parameters, with source/number checks.
- Candidate addition, rename, pause/re-enable, version differences and ranking-change explanations.
- Exclusive immutable snapshot commits and idempotent final results on job retries.
- Legacy-backend detection and restart guidance, preserving existing demo viewing.
- Browser regression coverage for editing, recovery, evidence binding and old-server compatibility; CI now includes the browser suite.

Still a development preview. File ingestion, automatic cross-source conflicts, arbitrary domain modeling, full extraction-quality evaluation and public release licensing remain outstanding. Docker Hub image download remains blocked on this machine; container runtime is unverified.

## Adaptive research and conversational action — 2026-11-09

- Explicit conversational research requests now execute the real adaptive graph and return a result to the same conversation; explanations do not start searches or create paths.
- Bounded targeted gap searches, dimension-aware original excerpts and concrete-page prioritization.
- Source-backed identifier/same-product reconciliation with preserved conflicts and branch-local updates.
- Public Suning price observations integrated into adaptive research, independent of stock; other categories no longer inherit laptop-only price bounds.
- Typed quotation/polarity/billing-period checks, compatible unit conversion, bounded original-passage recovery and source metadata.
- Actual planning validation feedback, safe snake_case keys and removal of unrequested default comparison requirements when explicit user priorities anchor the task.
- Reproducible fictional evidence evaluation plus optional real availability/graph probes. Live results remain incomplete and are reported in SEARCH-EVALUATION.md.

## Branch comparison and unified conversation — 2026-11-09

- Compare any two paths without changing either: separate constraint, review-mode and discovery-scope explanations, backed by saved source quotations.
- Inspect saved value ranges of eligible records and all conditions/weights on demand; no inferred performance percentages or market-wide coverage claims.
- Keep the approved compact canvas. Detailed comparison opens in a floating dialog; continuing research prepares an editable conversational request.
- Reveal the complete conversation above the canvas composer on focus, with scrolling and explicit close; remove the redundant inspector chat tab.
- Preserve validated user/assistant conversation records through export/import, while stripping executable/server-owned message properties.
