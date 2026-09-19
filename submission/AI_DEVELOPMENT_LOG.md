# AI Development Log

This log is the source material for the required AI Prompts Documentation PDF. It records
actual development activity from 2026-09-12 onward. Historical session logs are not copied
into this file and no prior activity is represented as if it occurred here.

## Entry template

### YYYY-MM-DD — TASK-ID — short title

- **Agent:** orchestrator | architecture-agent | product-agent | geometry-agent | backend-agent | frontend-agent | qa-agent
- **Prompt / purpose:**
- **Important reasoning:**
- **Decisions made:**
- **Verification:**
- **Failures / iterations:**
- **Final outcome:**
- **Files changed:**

## 2026-09-12 — SETUP-AUDIT — initial development setup audit

- **Agent:** orchestrator
- **Prompt / purpose:** Audit the repository guidance, product/architecture specifications, specialist-agent setup, and existing implementation before application development.
- **Important reasoning:** The repository is a greenfield planning scaffold. The requested root files `CLAUDE.md`, `rules.md`, and `AGENTS.md` are absent; `.clinerules/AGENTS.md` and `.clinerules/rules.md` are the available project guidance. No `package.json`, `packages/` directory, application code, or Git repository is present at the workspace root.
- **Decisions made:** Created a dependency-aware implementation roadmap without implementing application features. Preserved unresolved “3 ways” semantics as an explicit T-000 decision gate rather than silently choosing between normal alternative profiles and impossible-brief relaxation.
- **Verification:** Read the requested documentation and all six agent briefs; inspected the repository tree, task files, package/scaffold presence, Git status, and cross-document references for ownership and contract terms.
- **Failures / iterations:** The setup cannot yet run because the application scaffold and package configuration do not exist. This is recorded as T-001, not fixed during the audit.
- **Final outcome:** Initial task state, future-work parking lot, and this development-log structure were created. All future implementation tasks remain `PENDING`.
- **Files changed:** `tasks/TASKS.md`, `tasks/TODO.md`, `submission/AI_DEVELOPMENT_LOG.md`

## 2026-09-12 — T-000 — resolve “3 ways” contract

- **Agent:** orchestrator
- **Prompt / purpose:** Apply the product-owner decision to the ambiguity identified during the setup audit.
- **Important reasoning:** Ordinary valid briefs and impossible briefs need different alternative semantics. Combining them would make solver outputs, UI labels, and acceptance tests ambiguous.
- **Decisions made:** Ordinary valid briefs may use deterministic priority-profile alternatives as stretch behavior. Impossible briefs must use trace-driven relaxation paths, independently re-searched and fully validated, as the mandatory MVP behavior. The two modes require separate typed outputs and user-facing labels.
- **Verification:** User confirmed the recommended resolution. ADR-020 was appended without rewriting ADR-005 or ADR-015; T-010 was updated to carry the distinction.
- **Failures / iterations:** None.
- **Final outcome:** T-000 is `DONE`; implementation remains pending at T-001.
- **Files changed:** `docs/DECISIONS.md`, `tasks/TASKS.md`, `submission/AI_DEVELOPMENT_LOG.md`

## 2026-09-13 — T-001 — scaffold the workspaces

- **Agent:** architecture-agent (implementation delegated by the orchestrator; review and
  verification performed independently by the orchestrator)
- **Prompt / purpose:** Implement T-001 — the minimal npm-workspaces monorepo for
  `engine`/`web`/`server` with TypeScript/Vite/Vitest per ADR-001/ADR-011, compatible with the
  offline run path (PRD N1/N2). The delegation brief fixed the boundary constraints (engine =
  pure TS, zero runtime deps, DOM-free enforced at compile time via `lib: ["ES2022"]` +
  `types: []`; web depends only on `@kolher/engine`; server = zero-runtime-dep placeholder
  until T-012), the explicit non-goals (no three.js, no frameworks, no Express, no contracts
  [T-002], no catalog [T-003], no real server [T-012]), five mandatory verification commands,
  and required an ADR draft for the concrete scaffold choices.
- **Important reasoning:** Scaffolding is boundary definition, so it was delegated to the
  architecture-agent rather than an implementation agent. three.js was deliberately excluded —
  it is not named in T-001 and lands with T-015 (simplicity-first / no speculative deps).
  Engine purity is enforced structurally by the compiler, not by convention. Root scripts use
  npm's topological `--workspaces` ordering so the engine always builds before web.
- **Decisions made:** ADR-021 (monorepo scaffold conventions: ESM everywhere — NodeNext for
  engine+server, ESNext+Bundler+noEmit for web; typescript+vitest hoisted as root-only
  devDependencies; `@kolher/*` package naming; engines floor node >=20.19 / npm >=10; root
  scripts `build`/`test`/`typecheck`/`dev`/`start` as the documented local commands) — drafted
  as Proposed by the agent, reviewed and ratified Accepted by the orchestrator. No existing ADR
  was modified (append-only convention held; verified by ADR-heading inventory 001–021).
- **Verification:** The orchestrator read all 15 created files, then independently re-ran:
  `npm install` (idempotent; `package-lock.json` generated, 44,249 bytes); `npm run build`
  (topological order engine→server→web; Vite 7.3.6 build ok; engine constant inlined into the
  web bundle = end-to-end wiring proof); `npm test` (Vitest 3.2.7, 1/1 passed); `npm run
  typecheck` (clean in all three packages); `npm start` (builds, then server placeholder logs
  and exits 0); boundary greps (engine src has no `document|window|HTMLElement`; engine and
  server package.json have zero dependency keys; web dependencies = `@kolher/engine` only). The
  agent additionally proved the DOM guard is live with a negative probe (injected
  `document.title` into engine source fails `tsc`, probe then removed).
- **Failures / iterations:** The agent's first `npm install` hit a 30 s tool timeout
  mid-install; a second run reconciled cleanly (honestly reported). No design failures; no
  rework loops required after orchestrator review.
- **Final outcome:** T-001 is `DONE`. Acceptance criteria met: `npm install` and the documented
  local commands (root `README.md`) resolve to deterministic workspace entry points; packages
  remain engine/web/server separated with compile-time-enforced boundaries. Three non-blocking
  discoveries parked in `tasks/TODO.md` (no git repo at root; 2 moderate dev-only npm-audit
  findings; engine test files not covered by `tsc`).
- **Files changed:** `package.json`, `tsconfig.base.json`, `.gitignore`, `README.md`,
  `package-lock.json`, `packages/engine/{package.json,tsconfig.json,src/index.ts,src/index.test.ts}`,
  `packages/web/{package.json,tsconfig.json,index.html,src/main.ts}`,
  `packages/server/{package.json,tsconfig.json,src/index.ts}`, `docs/DECISIONS.md`,
  `tasks/TASKS.md`, `tasks/TODO.md`, `submission/AI_DEVELOPMENT_LOG.md`,
  `session-logs/2026-09-13-t001-scaffold-workspaces.md`

## 2026-09-13 — T-002 — define shared contracts and deterministic config

- **Agent:** architecture-agent (designated owner) — three delegated implementation attempts
  failed on tooling limits; the orchestrator implemented directly and recorded the deviation
  (see Failures/iterations)
- **Prompt / purpose:** Implement T-002 — one explicit cross-package contract
  (`InputSet`, `Candidate`, `Plan`, `BuildOutput`, receipts, render geometry, rule verdicts,
  priorities, config) plus the deterministic config (rule values C1–C8, anchors, weight
  tables, slot size, search budgets), with canonical ordering, numeric precision, and hash
  inputs defined and compile-fixture-proven across engine/web/server. Explicit non-goals:
  no catalog module (T-003), no rule evaluators (T-006/007), no solver logic (T-008/009),
  no AICli in engine types (T-013).
- **Important reasoning:** Spec seeds (SYS-ARCH §5–§6, OPT §§2–3/§14) were mirrored
  field-for-field with documented concretizations. Key resolutions: priority spelling
  `"balanced"` (OPT §6.1) over §2.4's `"balance"`; `InputSet.featureConstraints` concretized
  from the seed's `string[]` to the structured OPT §2.3 form (deterministic C7 matching
  requires it); `AICli`/`Blob` excluded from engine contracts (DOM-free purity); OPT §5's
  "single config file (one file per rule)" self-contradiction resolved as one rules module
  with one named entry per rule; `plan`↔`receipt` type cycle handled with `import type`.
- **Decisions made:** ADR-022 (contract location/ownership, priority spelling, engine type
  purity boundaries, canonicalJson in contracts, documented additive seed changes:
  `Candidate.id`/`Plan.id`, `Plan.bom`, discriminated `BuildOutput.kind`, `Zone` as a
  wall-strip span) — appended Accepted with index row; no existing ADR modified.
- **Verification:** Explicit exit codes this time (the first pass's `tail`-filtered output
  had hidden an engine `tsc` failure): `npm run build` exit 0; `npm test` exit 0 (2 files,
  6/6 tests — key-order-independence, 1-dp precision, weight-sum/topK invariants);
  `npm run typecheck` exit 0 (0 TS errors); DOM/network grep clean (the single `"door" |
  "window"` hit is a string-union false positive); `npm start` exit 0 with contract probe.
  Two defects found and fixed during verification: `Config` imported from the values module
  instead of `config-types.js` (2 × TS2459), and one test expectation that wrongly quoted
  canonical numbers.
- **Failures / iterations:** (1) First delegated attempt: user-aborted, zero artifacts.
  (2) Second: stream ended without finish reason after 14 iterations, zero artifacts.
  (3) Third: output-token limit after 13 iterations, zero artifacts. With the delegation
  path demonstrably unreliable and the task fully spec-mapped, the orchestrator implemented
  directly per AGENTS.md §1 and logged the deviation here rather than fabricating a
  delegation record.
- **Final outcome:** T-002 is `DONE`. Engine, web, and server compile against one explicit
  contract; config owns rule values, anchors, weights, slot size, and search budgets;
  canonical ordering/precision/hash inputs are defined and test-enforced. Planning-level
  config defaults seeded with `pending product audit` markers (product-agent audit parked
  in TODO). OPT spec mojibake noted and parked in TODO.
- **Files changed:** `packages/engine/src/contracts/{geometry,vocab,input,candidate,plan,
  receipt,render,engine,canonical,fixtures}.ts`, `packages/engine/src/contracts/
  canonical.test.ts`, `packages/engine/src/config/{config-types,config,rules}.ts`,
  `packages/engine/src/index.ts`, `packages/engine/src/index.test.ts`,
  `packages/web/src/main.ts`, `packages/server/src/index.ts`, `docs/DECISIONS.md`,
  `tasks/TASKS.md`, `tasks/TODO.md`, `submission/AI_DEVELOPMENT_LOG.md`,
  `session-logs/2026-09-13-t002-shared-contracts.md`

## 2026-09-13 — T-003 — implement catalog schema and quarantine pipeline

- **Agent:** backend-agent (designated owner) — delegation succeeded this session (61
  iterations); orchestrator independently reviewed the full diff and re-ran verification.
- **Prompt / purpose:** Implement T-003 per SCHEMA §2–§11 + Appendix A — normative catalog
  types reusing the T-002 contracts vocabularies, strict load-time validation/quarantine
  pipeline (§9 steps 2–10), geometry-bbox check (§6.3), veto>force>default compatibility
  graph (§7) and substitutes (§8), pure-TS SHA-256 catalog hash + snapshotId (§11),
  `loadCatalog()` + `LoadReport`, and the Stage-B test matrix (ADR-017): quarantine matrix
  (one mutant per all 12 reasons), transitive fixpoint, override precedence, default rule,
  substitutes, bbox, hash stability. Explicit non-goals: no curated SKU data (T-004),
  no rule evaluators, no solver; class data modules ship empty.
- **Important reasoning:** Engine purity (ADR-021) forbids `node:crypto`, so the catalog
  hash uses a dependency-free FIPS 180-4 SHA-256 verified against known-answer vectors.
  The §13.1/§13.3 examples mix offset conventions (edge-origin z vs centered deck x), so
  the §6.3 bbox window was widened to `[−span/2 − 10, span + 10]` per axis — recorded as
  ADR-023 so T-004 curation cannot silently drift. Quarantine is first-failing-check per
  SKU in §5.2 field order; reference integrity iterates to fixpoint; vetoes referencing
  dangling/self/quarantined ids are ignored + data-gap (never silent, never crash).
- **Decisions made:** ADR-023 (bbox check window) appended Accepted with index row.
  `HashInputs.catalogState` narrowing deferred to the solver call site (T-005+); no
  breaking contract change now.
- **Verification (orchestrator re-run, explicit exit codes):** `npm run typecheck` exit 0;
  `npm test` exit 0 — 4 files, 31/31 passed (25 catalog + 2 hash KAT + 6 prior contract/
  smoke tests); `npm run build` exit 0; DOM/Node/network grep over `src/catalog` clean.
- **Failures / iterations:** None. Delegation completed in one attempt.
- **Final outcome:** T-003 is `DONE`. Invalid rows quarantine deterministically and never
  enter `skus`, graph, substitutes, or any future search path; surviving rows and data
  gaps are deterministic and receipt-ready; `loadCatalog()` over the (currently empty)
  curated set yields a stable snapshot id.
- **Files changed:** `packages/engine/src/catalog/{schema,hash,validate,graph,index}.ts`,
  `packages/engine/src/catalog/{catalog,hash}.test.ts`,
  `packages/engine/src/catalog/data/{catalog_meta,finishes,compat_overrides,toilets,
  basins,faucets,showers,tubs,vanities,accessories}.ts`, `packages/engine/src/index.ts`
  (one export line), `docs/DECISIONS.md`, `tasks/TASKS.md`,
  `submission/AI_DEVELOPMENT_LOG.md`, `session-logs/2026-09-13-t003-catalog-pipeline.md`



## T-004 — Curate the demo catalog (2026-09-14)

- **Task:** Author the real-KOHLER demo catalog to SCHEMA §12 coverage — 50–64 SKUs
  across 7 fixture classes with water metadata, geometry descriptors, finish pricing,
  compatibility force/veto edges, and substitution chains; zero quarantine at load.
- **Agent / method:** Delegated to product-agent with SCHEMA §5–§12, the implemented
  validate.ts checks, and the ADR-023 bbox window as authoritative inputs. Second
  successful specialist delegation.
- **Scope boundaries stated:** Catalog stays descriptive (no rule values or anchors);
  class data modules only — no changes to engine code, tests, or loadCatalog() wiring;
  finishes table only extended if genuinely needed (it was not).
- **Important reasoning:** Real KOHLER product lines (Cimarron, Veil, Innate, Sensate,
  Purist, Artifacts, Archer, Jute, Tresham, Verdera…) give the demo credible model
  numbers; where data could not be network-verified, values are planning-level
  estimates under the existing `sourceNote` honesty frame and a flagged list was
  parked in TODO.md for a pre-demo trade-data pass. All 8 force edges are collection
  pairings already default-ok under §7.2, so the 8 REDUNDANT_FORCE data-gaps are the
  §7.4-sanctioned cost of curated pairings; vetoes cover the genuine double-basin
  conflict (pedestal/wall-hung basin × vanity).
- **Decisions made:** catalogVersion bumped 0.1.0 → 0.2.0 per SCHEMA §11. No new ADR.
- **Verification (orchestrator re-run, explicit exit codes):** `npm run typecheck`
  exit 0; `npm test` exit 0 — 4 files, 31/31 passed; `npm run build` exit 0;
  `loadCatalog()` → 57 loaded, 0 quarantined, snapshotId `0.2.0#3941623b` stable
  across repeated loads, 8 dataGaps (all REDUNDANT_FORCE, each listed in the session
  log).
- **Failures / iterations:** None.
- **Final outcome:** T-004 is `DONE`. 57 valid SKUs load with zero quarantine;
  §12 coverage, honesty metadata, and a stable snapshot id are in place for the
  geometry/solver tasks.
- **Files changed:** `packages/engine/src/catalog/data/{toilets,basins,faucets,
  showers,tubs,vanities,accessories,compat_overrides,catalog_meta}.ts`,
  `tasks/TASKS.md`, `tasks/TODO.md`, `submission/AI_DEVELOPMENT_LOG.md`,
  `session-logs/2026-09-14-t004-demo-catalog.md`

## 2026-09-14 — T-005 — room and fixture geometry primitives

- **Agent:** orchestrator (geometry-agent delegation unavailable — weekly agent limit; implemented directly and recorded honestly)
- **Prompt / purpose:** Implement T-005 — normalized polygon rooms, wall strips, openings/keep-clear, slot-grid snapping, fixture AABBs, and the Step-01 confirmation gate.
- **Important reasoning:** Strips partition the outline corner-to-corner so perpendicular overlap is measure-zero (no double-counted usable span); L-shape duplicate sides get deterministic `-2` suffixes by origin order; slot ties round toward +Infinity for consistency with `roundMm`.
- **Decisions made:** Opening keep-clear = exact opening span (swing-arc margin deferred to C3/T-006); `aabbForPlacement` never snaps (caller concern); new modules withheld from the public barrel until consumed (TODO recorded).
- **Verification:** `tsc --noEmit` clean; engine suite 101/101 (+43); shuffled-openings determinism produces canonical-identical BathroomRep.
- **Failures / iterations:** An interrupted earlier agent run had partially written its own file versions; duplicated/mixed content (TS2300) was discovered and resolved by truncating the agent copies and rewriting `slots.ts` cleanly.
- **Final outcome:** T-005 `DONE`; geometry foundation ready for C1–C6.
- **Files changed:** `packages/engine/src/geometry/{num,polygon,strips,openings,slots,aabb,room}.ts` + tests, `tasks/TODO.md`, `tasks/TASKS.md`, this log, session log.

## 2026-09-14 — T-006 — hard geometry rules C1–C6

- **Agent:** orchestrator (geometry specialist spawn failed on auth error; implemented directly under the same review standards)
- **Prompt / purpose:** Implement the six hard geometry rules with measured deltas and no short-circuit, in canonical C1→C6 order.
- **Important reasoning:** Conservative swing sector (AABB with config margin) instead of an exact quarter-disc trades precision for provable safety; rough-in = back-face center as a documented MVP assumption; C6 excludes windows from the doorway check.
- **Decisions made:** Recorded as ADR-024. Lesson institutionalized: with ADR-021's test exclusion from tsc, BOTH `tsc --noEmit` and `vitest` must run as gates (Vitest passes type-broken imports; tsc catches them).
- **Verification:** tsc clean; engine 130/130; rule trace covers all six rules with measured deltas on a hand-computed scene (rectangle + L-shape, EPSILON boundaries).
- **Failures / iterations:** Recovered a syntactically scrambled `common.ts` left by an interrupted session; fixed a real C1 bug (`minPairGapMm` initialized to 0 could never measure a positive gap — now Infinity-initialized); corrected two test-side arithmetic errors (boxGap is max per-axis separation, not Manhattan distance).
- **Final outcome:** T-006 `DONE`; T-008 consumes `evaluateGeometryRules`.
- **Files changed:** `packages/engine/src/geometry/rules/{common,c1_fit,c2_clearance,c3_swing,c4_zones,c5_plumbing,c6_sanity,index}.ts`, `rules.test.ts`, `docs/DECISIONS.md` (ADR-024), this log, session log.

## 2026-09-15 — T-007 — compatibility graph and C7 validation

- **Agent:** backend-agent (delegated); independently reviewed by the orchestrator
- **Prompt / purpose:** Implement the C7 hard pair-level compatibility evaluator over the T-003 catalog graph, with feature constraints and substitute closure.
- **Important reasoning:** OPT §5 is ambiguous between per-SKU and candidate-level required-tag matching; candidate-level coverage (at least one bound fixture carries the tag) chosen for required tags, per-SKU for forbidden tags.
- **Decisions made:** ADR-025. Quarantine stays authoritative at load; C7 only double-fails unknown ids. `wall_mount` is a carrier-wall consequence delta — C7 is not a wall-construction authority.
- **Verification:** Engine 142/142 (+13 C7 tests): override precedence (veto > force > default), finish-harmony default, no-short-circuit trace, mounting invariant, substitute closure, quarantine gate verified empirically against `buildCatalog`.
- **Failures / iterations:** None.
- **Final outcome:** T-007 `DONE`; solver consumes `evaluateC7` for pair-level binding validation.
- **Files changed:** `packages/engine/src/rules/c7_compat.ts`, `c7_compat.test.ts`, `docs/DECISIONS.md` (ADR-025), this log, session log.



## 2026-09-15 — T-008 — archetype and constructive solver

- **Agent:** backend-agent (delegated twice — first attempt aborted before writing; second completed); reviewed independently
- **Prompt / purpose:** Implement archetype filtering, cost-aware SKU binding, the wall-strip placement CSP with forward checking and bounded backtracking, and candidate assembly.
- **Important reasoning:** Placement = (wall assignment → 1D order → discrete slot on the 25 mm grid), plumbing-anchor-first then largest-footprint-first per OPT §9; bounded by a shared backtrack budget (10000) so exhaustion routes to typed infeasibility — never a hang.
- **Decisions made:** C8 stays arithmetically enforced in the solver; the C8 RuleVerdict evaluator moves to T-009. Two integration defects found and fixed: (1) C4 dangling-zone false blocker (room rep has no zone derivation — C4 is currently vacuous, parked in TODO); (2) C2 forward-check gap where side-clearance failures survived to full validation (fixed to prune on side corridors too).
- **Verification:** Engine 150/150 (+8 solver tests incl. full-validator re-check in-test, run-twice JSON determinism, budget exhaustion, gate, latency); typical 2400×1800 solve ~350–400 ms (≤ 2 s bound).
- **Failures / iterations:** The aborted first delegation's tail files were diffed before re-delegating (T-006 lesson applied); both integration defects above were found and fixed during wiring.
- **Final outcome:** T-008 `DONE`; `runConstructiveSolver` emits only fully-validated candidates.
- **Files changed:** `packages/engine/src/solver/{archetypes,bind,place,assemble,solve}.ts`, `solver.test.ts`, config tables, `tasks/TODO.md`, this log, session log.

## 2026-09-15 — T-009 — objective, BOM, ranking, and receipt

- **Agent:** backend-agent (delegation hit the GLM daily rate limit after writing the full module but no tests); orchestrator reviewed the code, kept it, and completed the task directly by writing the test suite
- **Prompt / purpose:** Implement anchored utilities, deterministic ranking, finish-aware BOM pricing, budget summaries, top-k, and the decision receipt.
- **Important reasoning:** Candidates carried no finish, so a finish-resolution step (`objective/finish.ts`) was required before BOM/C8/u_cost could see true cost — recorded as ADR-026.
- **Decisions made:** ADR-026 (finish resolution: eligibility by family, shared-family harmony, cheapest-then-lexicographic). u_cost anchored on B_target/B_max; u_space on spare-floor fraction; bounded spaciousness modifier applies to u_space only (ADR-006). Out-of-scope carries a documented min-viable-cost estimate (cost-only; parked in TODO as not placement-feasible by construction).
- **Verification:** Engine 164/164 (+14): plan/BOM/receipt consistency, receipt completeness, top-k bounds/order, anchor stability, budget-edge minRaise, determinism, latency < 2 s, priority oracle, tie-break matrix, gate propagation, C8 pass/fail, finish integrity.
- **Failures / iterations:** INFERENCE_CAP_ERROR mid-delegation; tree diffed BEFORE re-attempt (kept agent code, wrote tests directly).
- **Final outcome:** T-009 `DONE`; `solve()` returns a validated costed plan or typed infeasibility.
- **Files changed:** `packages/engine/src/objective/{finish,c8,scores,rank,build-plan,solve,index}.ts`, `objective/objective.test.ts`, `docs/DECISIONS.md` (ADR-026), this log, session log.


## 2026-09-15 — T-010 — explicit relaxation and “3 ways” behavior

- **Agent:** orchestrator (delegation skipped deliberately after two rate-limited backend runs; cross-module solve-pipeline refactor where partial agent writes carry the highest recovery cost)
- **Prompt / purpose:** Implement both “3 ways” modes per ADR-020: relaxation menus for impossible briefs (mandatory) and deterministic alternative priority profiles for ordinary briefs (stretch).
- **Important reasoning:** Extracted `validatedCandidates()`/`solvePlan()` so every relaxation path reuses the EXACT plan pipeline — full-validator-on-every-output holds by construction. Each path is independently re-searched, deduped by plan id, bounded at 3 plans.
- **Decisions made:** ADR-027 (typed solver diagnosis + catalog param deviate from the §6.1 seed signature). Hand-ordered levers: swap-sku → shrink-clearance → drop-class → raise-budget → move-door, each generated only when its lever can measurably move. An ultra-low-budget brief now yields a raise-budget menu instead of T-009's direct out-of-scope (supersedes; OPT §13.3 out-of-scope = exhausted relaxation).
- **Verification:** Engine 180/180 (+16 relax tests): full-validator assertions, distinctness, hand order, exhaustion → out-of-scope with traced blocker, malformed-input bypass, plan-path unchanged, determinism, no-mutation, latency, alternatives equivalence.
- **Failures / iterations:** Probed fixtures yield 1-plan menus (single-lever failures) — the 3-distinct-plans guarantee is brief-dependent; parked as TODO-27 and conclusively hunted in T-021.
- **Final outcome:** T-010 `DONE`; both modes shipped with separate typed outputs and UI labels.
- **Files changed:** `packages/engine/src/relax/{diagnose,paths,relax,alternatives}.ts`, `relax/relax.test.ts`, `objective/solve.ts` refactor, `contracts/plan.ts`, `docs/DECISIONS.md` (ADR-027), this log, session log.

## 2026-09-15 — T-011 — cache and incremental re-optimization

- **Agent:** orchestrator (delegation skipped deliberately — rate-limit pattern; small cross-module addition with full pipeline context already held)
- **Prompt / purpose:** Add canonical cache keys, weight-independent re-scoring, invalidation, and the `reoptimize` contract for priority/local/global changes.
- **Important reasoning:** Cache key = sha256 over canonicalJson of {polygon, openings (id-sorted), confirmed, featureConstraints, budget, config} — priority/spaciousness EXCLUDED (weight-only → cache hit), config included conservatively (staleness never acceptable).
- **Decisions made:** ADR-028. Bounded 32-entry process-level Map, insertion-order eviction; only "ok" sets cached. The cache stores candidates AND resolved finishes together (ADR-026 consequence). OPT §11.1.2 strip replacement deferred: local edits invalidate and run the bounded full re-search (~350 ms, inside N3) — correct-by-construction, parked in TODO.
- **Verification:** Engine 189/189 (+9): key invariance/exclusions, reoptimize-weights == JSON-identical fresh solve (< 300 ms), no stale geometry, local fallback fully revalidated, global == solve(), impossible-brief weights route to the honest wall, cold/warm determinism.
- **Failures / iterations:** None.
- **Final outcome:** T-011 `DONE`; T-017 adjustment re-scores are instant after the first solve warms the cache.
- **Files changed:** `packages/engine/src/cache/{key,cache,reoptimize}.ts`, `cache/cache.test.ts`, `objective/solve.ts` (one-line cache flow), `docs/DECISIONS.md` (ADR-028), this log, session log.


## 2026-09-15 — T-012 — thin server and static host

- **Agent:** orchestrator (same delegation posture as T-011: rate-limit pattern, small well-scoped backend task)
- **Prompt / purpose:** Implement built-asset hosting with SPA fallback, path allowlisting, bounded request parsing, and the `/api/nim` boundary shell — without moving engine solving into a backend round-trip.
- **Important reasoning:** Node built-in HTTP, no new deps (ADR-011). Traversal guard = resolved path must stay inside root + MIME extension allowlist; misses fall back to index.html so attempts leak only the SPA shell. Oversized bodies are destroyed mid-upload (1 MB bound cannot be bypassed by chunking).
- **Decisions made:** No new ADR — implementation is exactly ADR-011 / SYS-ARCH §6.2; no deviations needed.
- **Verification:** Server 13/13 integration tests on a real listening server (static, SPA, encoded/null-byte/dot-segment traversal, 415/400/405, oversized-body safety); live smoke on built assets (root 200, hashed asset 200, `/api/nim` fallback JSON).
- **Failures / iterations:** None.
- **Final outcome:** T-012 `DONE`; T-013 replaces the placeholder adapter call behind the bounded shell.
- **Files changed:** `packages/server/src/{static,http,index}.ts`, `src/server.test.ts`, `packages/server/package.json`, this log, session log.

## 2026-09-15 — T-013 — AI adapter and offline fallback

- **Agent:** backend-agent (delegated); independently reviewed and verified by the orchestrator
- **Prompt / purpose:** Implement the §6.3 AICli seam: taste→features, advisory-only photo proposals, receipt-bound narration, tradeoff rephrasing; NIM client + strict validators + deterministic offline twin; any NIM failure degrades honestly and the adapter never throws.
- **Important reasoning:** AI output is advisory/derived input only — the engine remains the sole authority for geometry, compatibility, cost, feasibility (ADR-002). Narration is receipt-bound (ADR-014): every number in AI prose must appear in the receipt JSON; tradeoff rephrases cannot introduce digits absent from `tradeoffDelta`.
- **Decisions made:** `/api/nim` envelope extended with typed payload fields and a task discriminator (documented deviation — one endpoint, three tasks requires it). Adapter methods are async returning `AiResult<T>{value, fallback, reason}` (sync signatures cannot express fallback posture). `tasteToFeatures` returns null constraints for gibberish (honest) instead of inventing empty constraints. Key held server-side only, never echoed.
- **Verification:** Server 38/38 (+19): offline determinism, full fallback matrix, NIM happy path via injected fetch, unknown-tag dropping, injection tripwires, receipt number-binding, tradeoffs digit guard, key non-disclosure, 1 MB 413 intact, all four tasks fully offline.
- **Failures / iterations:** None.
- **Final outcome:** T-013 `DONE`; offline mode completes the core demo; web bundle cannot contain the adapter.
- **Files changed:** `packages/server/src/ai/{adapter,nim,offline,validate,index}.ts` + `adapter.test.ts`, `packages/server/src/http.ts`, this log, session log.

## 2026-09-15 — T-014 — 2D layout renderer

- **Agent:** frontend-agent (delegated); independently reviewed and verified by the orchestrator
- **Prompt / purpose:** Render room outline, openings, fixture AABBs, dimensions, clearances, and swing annotations as a pure projection of engine data — no renderer-side fixture geometry invented.
- **Important reasoning:** Two-part implementation because the `RenderGeometry` contract had no producer: an engine bridge (`buildRenderGeometry`) recomputing AABBs with the SAME primitives the solver uses (annotations derived only from the fired-rule trace), and a web canvas layer (`drawRender2d`) with pure projection math and one documented y-flip.
- **Decisions made:** The pre-approved TODO export of geometry helpers from the engine barrel was executed here (first consumer landed).
- **Verification:** Engine 195/195 (+7 builder tests: determinism, AABB ground truth, annotation grounding, finish mapping, tiny-room); web 7/7 (boundary coords, affine purity, render-equality via recorded mock ctx, per-annotation snapshots); typecheck + vite build clean.
- **Failures / iterations:** None.
- **Final outcome:** T-014 `DONE`; the 2D tab of the results toggle consumes it in T-017.
- **Files changed:** `packages/engine/src/render/build-render.ts`, `packages/web/src/render2d/*` + tests, `packages/engine/src/index.ts`, this log, session log.


## 2026-09-15 — T-015 — procedural 3D renderer

- **Agent:** orchestrator (reviewed and completed an existing frontend renderer implementation, then ran targeted fixes and regression checks)
- **Prompt / purpose:** Build the room and fixture 3D scene from catalog `geometry_descriptor` primitives, chosen finishes, solver placement, and camera controls (Three.js, procedural — no photoreal assets).
- **Important reasoning:** Two correctness gaps fixed in the pre-existing implementation: descriptor axes now follow SCHEMA §6.1 (x = width, y = fixture height, z = depth away from wall — previously y/z swapped), and wall segments carry deterministic Y-axis rotation so vertical walls render along the boundary.
- **Decisions made:** Missing catalog SKUs fail the render contract instead of creating a guessed fallback mesh — preserves `render = catalog geometry` (BOM provenance). Non-finishable primitives use the ceramic-white default; finishable ones use the chosen finish swatch.
- **Verification:** typecheck all 3 workspaces; build clean (Three.js bundle-size warning only); engine 195/195; web 18/18 (scene-graph smoke: non-empty, deterministic, fully materialized; descriptor provenance/sensitivity, finish mapping, opening gaps, missing-SKU rejection, side-wall rotation).
- **Failures / iterations:** The in-app browser connector was unavailable, so the desktop/mobile visual-inspection gate could NOT run. **T-015 therefore remains `REVIEW` (not DONE) — no visual pass is claimed.** Automated acceptance is complete; the functional cross-renderer equality aspect is additionally covered by the T-020 QA suite.
- **Final outcome:** Implementation complete and honest status maintained; visual gate open as a recorded limitation.
- **Files changed:** `packages/web/src/render3d/{sceneSpec,build3d}.ts` + tests, `packages/engine/src/contracts/render.ts`, `packages/engine/src/render/build-render.ts`, `tasks/TASKS.md`, this log, session log.

## 2026-09-16 — T-016 — room and taste flow

- **Agent:** orchestrator (frontend implementation and verification pass)
- **Prompt / purpose:** Build the reducer-backed store and the Room/Taste screens: photo/rectangle-L input, authoritative dimensions, preview confirmation gate, taste text, feature chips, priority, spaciousness, budget, and explicit loading/empty/error states.
- **Important reasoning:** The solver cannot run before confirmation — unconfirmed room state returns a typed gate error and never reaches `solve()`. `/api/nim` is attempted only as an advisory mapping seam; missing server/timeout/malformed response falls back to the local closed-vocabulary mapper; photo cues are advisory-only and never create authoritative geometry.
- **Decisions made:** Photo uploads bounded to 700 KB; deterministic default door opening; restrained responsive planner UI preserving offline-first honesty framing.
- **Verification:** typecheck all; web build clean; web 25/25 (+7 store tests incl. the confirmation gate); engine 195/195 (no regression); Impeccable detector over changed files — no findings. Live-browser click-through was attempted repeatedly (Vite dev server live at 127.0.0.1:5173; Brave target probed) but the browser connector returned no targets — screenshots unavailable; the journey was instead verified through store integration tests (T-018 full-loop) and the T-021 rehearsal.
- **Failures / iterations:** None beyond the browser-tooling limitation recorded above.
- **Final outcome:** T-016 `DONE` (store-integration and rehearsal evidence; visual screenshots never captured).
- **Files changed:** `packages/web/src/{main.ts,store.ts,store.test.ts,styles.css}`, `tasks/TASKS.md`, this log, session log.

## 2026-09-16 — T-017 — results, adjustment, and export flow

- **Agent:** orchestrator (frontend implementation pass with follow-up review fixes)
- **Prompt / purpose:** Build the Result screen: plan/BOM presentation, authoritative 2D/3D toggle, receipt panel, receipt-bound narration, relaxation choices, typed adjustments, and BOM CSV + 2D PNG export.
- **Important reasoning:** The result view shows only completed validated outputs; impossible briefs offer the agreed alternatives; the honest out-of-scope wall renders without fabricating a plan. Adjustments mark stale outputs pending until `reoptimize()` completes; stale plans are never re-rendered or exported.
- **Decisions made:** Receipt top-k rows deduped by candidate id (TODO-028 follow-through). Follow-up review fixes: stale-output invalidation after brief edits, stale async narration cancellation, L-shaped door offset validation against wall strips, relaxation selection preserved by kind, mixed adjustments classified global, both exports gated while edits are pending.
- **Verification:** typecheck all; build clean; engine 195/195, server 38/38, web 26/26; Impeccable detector clean. Live-browser smoke unavailable (same connector limitation as T-016); covered by store suites and later the T-021 rehearsal.
- **Failures / iterations:** None beyond the browser-tooling limitation.
- **Final outcome:** T-017 `DONE`.
- **Files changed:** `packages/web/src/{main.ts,store.ts,store.test.ts,styles.css}`, `tasks/TASKS.md`, this log, session log.


## 2026-09-16 — T-018 — offline end-to-end integration

- **Agent:** orchestrator (architecture integration gate)
- **Prompt / purpose:** Wire engine, server, AI fallback, store, renderers, receipt, and export into the documented Room → Taste → Result → Adjust → Export journey with no network/key dependency.
- **Important reasoning:** No new product surface — only integration: server startup now binds `127.0.0.1` by default (`HOST` override) to keep the local demo's network surface narrow; loopback explicitly bound in tests.
- **Decisions made:** Added a web-store full-loop integration test: deterministic room preview → confirmation → offline taste mapping → solve → selected validated result → BOM/render fixture-ID equality → priority re-optimization → rebuilt authoritative render geometry.
- **Verification:** Clean `npm install` from lockfile (clean-install probe interrupted by a registry stall; restore verified); `npm run build` all workspaces; `npm test` 260/260 (engine 195, server 38, web 27); typecheck clean; `npm start` on loopback with no key; HTTP smoke (`/` 200, SPA 200, `/api/nim` deterministic offline fallback). Engine solve remains in-process in the browser (ADR-011).
- **Failures / iterations:** Three.js bundle-size warning retained (non-blocking); T-015's separate visual gate explicitly left open.
- **Final outcome:** T-018 `DONE`.
- **Files changed:** `packages/server/src/index.ts` + server tests, `packages/web/src/store.test.ts` (full-loop test), this log, session log.

## 2026-09-16 — T-019 — adversarial engine QA

- **Agent:** qa-agent (dedicated adversarial suites in `packages/engine/src/qa/`; no production module modified)
- **Prompt / purpose:** Attack geometry, catalog, budget, compatibility, determinism, relaxation, cache, and performance invariants.
- **Important reasoning:** Coverage: no invalid plan on any output path (solver verdicts, receipts, render/BOM fixture-ID equality); full priority × spaciousness matrix with anchor stability; L-shape and conservative-swing probes; C7 edge cases; solve/re-solve hash equality; bounded cache eviction and cross-brief isolation; N3 latency on representative briefs.
- **Decisions made:** Severity triage: 0 critical / 0 high / 0 medium / 0 low production defects. The single discovered failure was a TEST-side spec mismatch (probe contradicted the documented contract); the corrected assertion is the regression test, owner qa-agent.
- **Verification:** Full suite green 317/317 (engine 252, server 38, web 27); adversarial suites pass; no outstanding failure reports.
- **Failures / iterations:** One in-session failure, test-side, corrected in-session.
- **Final outcome:** T-019 `DONE`.
- **Files changed:** `packages/engine/src/qa/{adversarial,cache-catalog}.test.ts`, this log, session log.


## 2026-09-16 — T-020 — server/UI/security QA

- **Agent:** qa-agent (no production code modified; one new QA suite)
- **Prompt / purpose:** Attack the server boundary, AI failure/degradation, UI state completeness, cross-renderer render equality, export, secrets, path traversal, input limits, and cross-viewport basics.
- **Important reasoning:** One authoritative `RenderGeometry` feeds both 2D draw and 3D scene spec; fixture sets equal to BOM on a real solve; both deterministic. Secrets: grep for key patterns across src/dist (none in source or web bundle); key never echoed in responses.
- **Decisions made:** Severity triage: 0 critical/high/medium; 2 low parked in TODO.md — L1 `GET /api/nim` fell through to SPA fallback (closed in T-021 with a 405 JSON guard); L2 dev-only vitest advisory chain (breaking fix = vitest@5; runtime ships zero dependencies, offline demo unaffected).
- **Verification:** Server boundary 38 tests; traversal probes leak nothing outside webRoot; AI fallback matrix consistent offline vs hosted; UI state + new cross-renderer suite (+3 tests); export gates consistent; 1 MB body hard-destroy; taste text sliced to 4000 chars; HTTP+UI smoke on the built bundle; performance: solve ≈ 192 ms cold, cached re-solve ≈ 116 ms, cached reopt ≈ 11 ms (inside N3); `npm test` 320/320 (engine 252, server 38, web 30).
- **Failures / iterations:** None.
- **Final outcome:** T-020 `DONE`.
- **Files changed:** `packages/web/src/qa/qa.test.ts`, `tasks/TODO.md`, this log, session log.

## 2026-09-16 — T-021 — demo hardening and acceptance rehearsal

- **Agent:** product-agent (rehearsal harness + evidence; orchestrated review)
- **Prompt / purpose:** Exercise the scripted typical brief and impossible briefs, verify narration/receipt honesty, capture reproducibility and latency evidence, and prepare the demo rails.
- **Important reasoning:** Rehearsal harness `scripts/rehearse.mjs` measures the built engine directly. Determinism is checked run-to-run; every output path (plan / relaxation menu / out-of-scope) is exercised.
- **Decisions made:** Menu-richness hunt (TODO-27) concluded: NO demo-reachable brief yields ≥2 distinct recovery plans — all observed failures are single-lever (dead `raise-budget`, vanity max-1 archetypes, single-finish vanity pool). Demo presents **1 honest plan**, narrated as such. L1 from T-020 closed: non-POST methods on `/api/nim` now answer 405 JSON.
- **Verification:** `npm run build && npm test` — 320/320 green; `node scripts/rehearse.mjs` — typical plan `kind:plan`, cost ₹40,200, 3 fixtures, `deterministic: true`, ≤200 ms first solve, within budget; steer reopt valid; add-a-tub → relaxation menu (drop-class); matte-black taste → relaxation menu (swap-sku); kill brief → honest out-of-scope in 7 ms; offline server boot HTTP 200 at 127.0.0.1:4173; `GET /api/nim` → 405. Evidence and demo rails in `submission/DEMO_REHEARSAL.md`.
- **Failures / iterations:** None; known demo limitations recorded honestly in DEMO_REHEARSAL §4.
- **Final outcome:** T-021 `DONE`.
- **Files changed:** `scripts/rehearse.mjs`, `packages/server/src/http.ts` (405 guard), `submission/DEMO_REHEARSAL.md`, `tasks/TODO.md`, `tasks/TASKS.md`, this log, session log.

## 2026-09-16 — T-022 — prepare submission evidence

- **Agent:** product-agent (implemented directly by the orchestrator — documentation assembly from already-gathered repo evidence; no specialist needed)
- **Prompt / purpose:** Assemble the AI-prompts documentation source, implementation evidence, demo checklist, and deck/video inputs without changing product scope.
- **Important reasoning:** The development log above (T-000…T-021 entries) is the complete, fact-checked source for the required AI Prompts Documentation PDF; every entry is drawn from the corresponding `session-logs/` record. The product's actual NIM prompts are appended verbatim below. Deck/video binaries are human deliverables; T-022 ships their sources and shot lists.
- **Decisions made:** T-015 stays `REVIEW` — its live visual-inspection gate never ran (browser tooling unavailable); documented honestly rather than silently closed. No git repository exists at the workspace root (parked TODO item from T-001) — recorded as an open risk for the source deliverable rather than silently initialized.
- **Verification (live, this session):** `npm run build` clean; `npm test` 320/320 (engine 252, server 38, web 30); `node scripts/rehearse.mjs` — typical plan ₹40,200, `deterministic: true`, 193 ms first / 9 ms repeat; steer reopt valid 8 ms; drop-class and swap-sku menus produced. `submission/SUBMISSION_CHECKLIST.md` reviewed against PRD §16/§21 deliverables and this log.
- **Failures / iterations:** None.
- **Final outcome:** T-022 `DONE`; all four PRD deliverables have complete sources/inputs; binary artifacts (PDF, video, deck export) are documented hand-off items.
- **Files changed:** `submission/AI_DEVELOPMENT_LOG.md` (T-005…T-022 entries + prompts appendix), `submission/SUBMISSION_CHECKLIST.md` (new), `tasks/TASKS.md`, this log.


---

## Appendix — Product AI prompts (verbatim, as shipped)

These are the exact system/user prompt strings sent to NVIDIA NIM (`moonshotai/kimi-k3`) by `packages/server/src/ai/adapter.ts`, with their guard rails. Every AI output is strictly validated; any failure (no key, network error, non-2xx, timeout, invalid JSON/schema, unknown vocabulary, injection trip) degrades to the deterministic offline twin. AI output is advisory only — the engine is the sole authority for geometry, compatibility, cost, and feasibility.

**System prompts (guards):**

1. JSON guard (used for taste→features and tradeoff rephrasing):
   > "You are a strict JSON API. Respond with ONLY a single JSON value, no prose, no markdown fences."

2. Prose guard (used for narration):
   > "You narrate bathroom design decisions. Use ONLY the facts and numbers in the provided decision receipt. Never invent numbers. Plain prose, under 120 words."

**User prompts (task payloads):**

3. Taste → features:
   > "Taste brief: {text}\nMap to {\"requiredFeatures\":[],\"preferredClasses\":[],\"finishFamilies\":[],\"classCountRanges\":{}} using ONLY these closed vocabularies: features: smart|bidet|heated_seat|self_cleaning|dual_flush|low_flow|rain_shower|thermostatic|touchless|single_lever|comfort_height|elongated|overflow_none|soft_close|floor_mount|wall_mount|deck_mount|freestanding; finishes: white|chrome|brushed_nickel|matte_black|brushed_gold|stone; classes: toilet|basin|faucet|shower|tub|vanity|accessory."

4. Narration:
   > "Decision receipt JSON: {receipt JSON}\nNarrate the recommendation for the user."

5. Tradeoff rephrasing:
   > "Relaxation menu JSON: {menu items with kind + tradeoffDelta}\nReturn ONLY a JSON array of strings, one rephrase per menu item. Never add numbers not present in tradeoffDelta."

**Photo → proposals:** no prompt is sent. The photo path is advisory-only per ADR-009: without a validated vision round trip the only honest proposal is the empty one (`reason: photo-vision-not-wired`).

**Post-processing validators (server-side, strict):** feature constraints parsed against the closed vocabularies (unknown tags dropped); narration accepted only if every number appears in the receipt JSON; tradeoff strings accepted only if no digits absent from `tradeoffDelta`; prompt-injection tripwires run on all taste text. Config: base URL `https://integrate.api.nvidia.com/v1`, model `moonshotai/kimi-k3`, 8 s timeout, 512-token cap. The API key is read once from env server-side and never echoed or shipped to the web bundle.