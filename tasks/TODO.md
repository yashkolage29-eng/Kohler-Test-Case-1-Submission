# TODO — KOHLER AI Bathroom Designer & Planner

This is the parking lot for future or non-blocking work. Items here are deliberately outside
the active MVP roadmap in `tasks/TASKS.md` and must not be implemented without reprioritization.

- Full KOHLER catalog and live trade-data integration.
- Durable projects, authentication, multi-user sessions, and persistence.
- Production backend extraction, hosted scaling, and deployment infrastructure.
- Certification-grade legal/code compliance and jurisdiction expansion beyond the Pune-flavored demo.
- E-commerce, dealer handoff, lead capture, and live inventory/pricing.
- AR/mobile experiences and photoreal product meshes or GLTF assets.
- Catalog authoring UI, per-finish imagery, multi-vendor support, locale switching, and currency switching.
- True Pareto-front browsing beyond the bounded scalar objective and documented alternative profiles.
- Blender hero still and optional non-binding moodboard generation.
- Initialize a git repository at the workspace root (currently none) so implementation history is auditable for the submission source deliverable. (Discovered during T-001, 2026-09-13.)
- Reassess `npm audit` findings (2 moderate, vite/vitest install-time chain, dev-only; runtime ships zero dependencies so N1/N2 are unaffected) before submission — candidate input for T-020 security QA. (From T-001 scaffold.)
- Engine `*.test.ts` files are Vitest-executed but excluded from `tsc` type-checking (ADR-021 consequence); consider a `tsconfig.test.json` when real suites land in T-003+. (From T-001 scaffold.)
- Zone derivation for the room rep is unimplemented: the solver emits `zones: []` so C4 is currently vacuous (documented in `packages/engine/src/solver/place.ts`). If real zone spans land (T-006/T-007 scope revisit), wire `makeFixture` to them and tighten C4. (From T-008, 2026-09-15.)
- BOM `byZone` grouping currently buckets by fixture CLASS (SYS-ARCH §5.4 leaves zone buckets informal). If real zone spans land (see C4 item above), re-group line items by zone span instead. (From T-009, 2026-09-15.)
- Product audit of the objective point-scale coefficients (20/10/50 in `objective/scores.ts`) and the eco-gold/luxury/maintenance anchors — engine constants flagged in ADR-026, pending product sign-off. (From T-009, 2026-09-15.)
- `minViableCost` (objective/solve.ts) is a cost-only estimate (cheapest SKU per class × archetype min counts); it is not placement/compatibility-feasible by construction. T-010's relaxation work may want a tighter measured minimum. (From T-009, 2026-09-15.)
- Product-agent audit of the planning-level config defaults seeded in `packages/engine/src/config/` (C2 clearances + minLegal, C3/C5 values, priority weight tables, spaciousness modifiers, eco-gold/luxury/maintenance anchors, `minBudgetInr`), each marked `pending product audit` in source. Feed audit results into T-004/T-006 value ownership. (From T-002.)
- `docs/OPTIMIZATION_SPEC.md` contains mojibake/corruption artifacts in several sections (stray "theft" tokens, CJK punctuation) — cosmetic doc cleanup candidate, non-blocking. (Noted during T-002 contract mirroring.)
- Pre-demo trade-data pass over the curated catalog: hand-verify every flagged model number, INR price, and dimension against live KOHLER India retail data (SCHEMA §12/§16.5 acceptance item; agent-authored values are planning-level estimates, honest list recorded in session-logs/2026-09-14-t004-demo-catalog.md). (From T-004, 2026-09-14.)
- Export `geometry/*` (buildBathroomRep, buildWallStrips, aabbForPlacement, snapToSlotMm, etc.) from `src/index.ts` when T-006/T-008/T-014 first consume them; left un-exported during T-005 to avoid widening the frozen public surface without a consumer. (From T-005, 2026-09-14.)
- Review whether the Step-01 gate's `buildBathroomRep` should live in a `gate/` or top-level engine module once T-008 wires the solver pseudocode (`solve(I)` Step-01 assertion). Current home: `geometry/room.ts`. (From T-005, 2026-09-14.)
- Relaxation menu richness is brief-dependent: probed impossible fixtures yield 1-plan menus (single-lever failures — pure budget or pure clearance); the OPT §10.2.5 “3 distinct plans” demo guarantee needs a brief where multiple levers independently succeed. **T-021 rehearsal hunted exhaustively (2026-09-16): no demo-reachable brief yields ≥2 distinct plans.** Confirmed causes: (a) `raise-budget` is effectively dead — `minViableCost` counts only config class-minimums (₹40,200) and the ₹50k MIN_BUDGET gate already exceeds it, so `budgetDeficitInr` is never positive; (b) every archetype caps `vanity` at max 1, so double-vanity demands conflict with all templates (`no-feasible-archetype`), and `drop-class` only zeroes the single most expensive class (tub first), which cannot rescue a vanity-count conflict; (c) vanities ship only in `white_stone` (family `stone`), so white/chrome taste empties the vanity pool → `no-valid-candidate` with EMPTY blockers (thin diagnosis; swap-sku recovers). Demo presents 1 honest plan. Fixing any of (a)–(c) is post-submission engine/product work.
- Receipt `topK` can contain duplicate candidate ids: candidates differing only in placement share the canonical SKU-join id (candidateKey ≠ id). Harmless for correctness (scores identical), but a UI list keyed by id will collide — dedupe by id in T-017 or consider placement-aware ids in a follow-up contract change. (From T-010, 2026-09-15.)
- (From T-020, 2026-09-16) `GET /api/nim` falls through to the SPA fallback (200 text/html) instead of a 405: the API block only intercepts POST. **CLOSED in T-021 (2026-09-16)**: GET (and any other method on the path) now answers 405 JSON; server suite green.
- (From T-020, 2026-09-16) Consider upgrading vitest to v5 before submission to clear the 2 moderate dev-only `@vitest/mocker` advisories (GHSA-82fw-gwwq-j7x9); breaking change, runtime unaffected. (session-logs/2026-09-16-t020-server-ui-security-qa.md, L2)
- OPT §11.1.2 targeted strip replacement for local reopt changes is deferred: `reoptimize(local)` invalidates and runs the bounded full re-search (~350 ms typical, inside N3) — correct-by-construction, documented in ADR-028. Strip surgery would need a placement-strip seam on whole-bathroom candidates; revisit only if T-017 adjustment latency ever approaches the 2 s budget. (From T-011, 2026-09-15.)
- (From T-025, 2026-09-18) Photo → fixed plumbing (existing drain/wet wall) proposals mapped to `plumbingZones`; needs a room-page plumbing marker/editor and solver wiring. Deferred by user decision.
- (From T-025, 2026-09-18) Pre-existing: `packages/web/ui.test.ts` (Playwright spec) is collected by Vitest and fails with "Playwright Test did not expect test() to be called here"; exclude it from the Vitest include pattern.
- (From T-025, 2026-09-18) NVIDIA NIM free tier intermittently answers 503 "Service temporarily overloaded" (observed ~25–50% of décor calls during testing); the app falls back to offline décor. Option: one attempt on a backup text model (e.g. `openai/gpt-oss-20b`) on upstream 503 only, inside the same pool budget.
- (From T-025, 2026-09-18) Pre-existing: full-innerHTML re-render remounts the 3D canvas (orbit resets) on any state change, e.g. typing in the adjust panel.
- (From T-025, 2026-09-18) Pre-existing: Result export button says "Download 2D layout" but downloads the 3D scene PNG.
- (From T-026b, 2026-09-18) ~~Switching Rectangle → L-shape put the door on the wrong/short wall.~~ **CLOSED in T-029**: openings re-homed by physical position on shape change.
- (From T-026b, 2026-09-18) While dragging a wall outward, the pinned viewBox lets the outline run past the preview panel edge until release (re-fits on drop).
- (From T-026c, 2026-09-18) Pre-existing lint error: `packages/web/src/proposals.test.ts` imports unused `selectedPlan`.
- (From T-026c, 2026-09-18) Server `narrate` route is now unused by the web app (receipt panel removed); remove it or keep for API parity.
- (From T-027a, 2026-09-18) ~~Deck faucet placed as an independent wall fixture.~~ **CLOSED in T-028**: faucets mount on their basin.
- (From T-027a, 2026-09-18) Basin mount type (undercounter / vessel / wall-hung) is read from the catalog product name ("vessel") and `wall_mount` tag; a dedicated catalog field would be cleaner.
- (From T-027b, 2026-09-18) ~~Style presets steer finish family only.~~ **CLOSED in T-028**: presets declare preferred product forms with per-class fallback.
- (From T-028, 2026-09-18) Tell the user when a style product preference was dropped by the fallback (e.g. "one-piece WC does not fit this room"); today it is silent.
- (From T-028, 2026-09-18) `u_space` counts deck-faucet footprint area although faucets now sit inside their basin; exclude faucets from used floor area (changes scores — needs product sign-off).
- (From T-028, 2026-09-18) Pre-existing lint: `packages/engine/src/solver/bind.ts` `bindingPool` declares unused `families` / `familyByFinishId`.
- (From T-030, 2026-09-19) The text room-edit path is now unused by the UI: store `ROOM_AI_TEXT`/`roomAiText`, `requestProposal("room-edit")`/`roomPromptContext` in `web/src/proposals.ts`, and the server `room-edit` route. Remove them or keep them for API parity.
- (From T-031, 2026-09-19) `npx eslint packages/web/src` fails on a pre-existing unused import `selectedPlan` in `packages/web/src/proposals.test.ts:2`. Remove it so lint is green.

- (2026-09-22, found during T-032) `submission/DEMO_REHEARSAL.md` quotes the old typical plan (₹40,200). After ADR-034 the typical brief lands at ₹1,80,000 (4 fixtures incl. shower + vanity). Re-run `node scripts/rehearse.mjs` and refresh the doc before the demo.
- (2026-09-22) Shower SKUs are heads only (no enclosure/glass), so the "required shower" renders as a small wall head and is easy to miss in the overview camera.
- Glass shower screen / enclosure: head-only shower SKUs have no reserved shower-zone footprint, so a presentation screen could overlap a fixture. Needs an engine shower zone first (T-043 decision Q6).
- Freestanding tubs could sit away from the wall as an island in large rooms; today fixtures always hug a wall strip (T-043 Q5).
- Wall art on the two camera-facing walls is hidden by the overview cutaway; consider preferring the far walls for art.

