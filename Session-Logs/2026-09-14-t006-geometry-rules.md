# T-006 — Hard geometry rules C1–C6 (2026-09-14)

Owner: orchestrator (geometry specialist agent infrastructure was unavailable — auth
error on subagent spawn; implemented directly under the same review standards).

## Recovery note
A prior session had been interrupted mid-write: `geometry/rules/common.ts` was
syntactically scrambled (export statements truncated, `inflateAabbMm` header separated
from its body), and `c1_fit.ts`/`c2_clearance.ts` existed but imported `FixtureBinding`
from `contracts/geometry.js` (it lives in `contracts/candidate.js`). Vitest still passed
(101 tests) because Vitest strips types without checking imports; `tsc --noEmit` caught
the breakage. Lesson: the ADR-021 test-exclusion split means `tsc` and `vitest` must
BOTH run as gates.

## What was done
- Reconstructed `common.ts` cleanly (single helpers: sortBindings, resolvePlacements,
  clearDistanceMm, boxGapMm, inflateAmm, overhangOutsideBboxMm, sortById).
- Fixed imports in `c1_fit.ts`, `c2_clearance.ts`.
- Implemented `c2_clearance.ts` (existing draft reviewed, kept), `c3_swing.ts`,
  `c4_zones.ts`, `c5_plumbing.ts`, `c6_sanity.ts`, `rules/index.ts` composite
  `evaluateGeometryRules` (C1→C6 canonical order, no short-circuit).
- Tests: `rules.test.ts` — 29 tests, hand-computed scene (2400×1800 rect + L-shape),
  EPSILON boundary per rule, config-driven-value assertions, determinism, dangling-
  binding surfacing in every rule.

## Findings
- **C1 bug fixed**: `minPairGapMm` initialized to 0 meant a positive min gap was never
  measurable (always reported 0). Found by a test asserting the measured value on a
  passing candidate. Now Infinity-initialized, rounded, 0 only when < 2 fixtures.
- Two test-side arithmetic errors (boxGap = max of per-axis separations, not Manhattan
  distance) caught and corrected — deltas are exact and the tests document the math.

## Modeling decisions
Recorded in ADR-024: swing hinge = opening start point, conservative sector AABB with
config margin; rough-in = back-face center (documented MVP assumption); C6 doorway
check excludes windows; C4 dangling-zone-requirement fails explicitly.

## Verification
tsc --noEmit clean (engine, web); vitest 130/130 across the engine package; engine
rule trace covers all six geometry rules with measured deltas.

## Handoff
- T-008 (solver) consumes `evaluateGeometryRules(bindings, rep, config)` from
  `geometry/rules/index.ts`.
- T-007 (compatibility) starts from a clean C1–C6 boundary; no geometry-layer work
  remains pending for it.
- QA (T-019) should property-test the conservative swing model vs a true quarter-disc
  and probe rough-in assumptions with adversarial inputs.
