# T-011 — Cache and incremental re-optimization (2026-09-15)

Owner: orchestrator; implemented directly by the orchestrator. Delegation was skipped
deliberately (GLM daily rate-limit pattern from T-008/T-009/T-010, and this is a small
cross-module addition where the orchestrator already held full pipeline context).

## What was done
- `cache/key.ts` — `candidateCacheKey(input)`: sha256 over canonicalJson of
  {polygon, openings (id-sorted), confirmed, featureConstraints, budget, config}.
  priority/spaciousness EXCLUDED (weight-only → cache hit); config included
  conservatively (staleness never acceptable). Openings reordering cannot invalidate
  (canonical entity order). Recorded as ADR-028.
- `cache/cache.ts` — `CandidateCache`: bounded process-level Map (32 entries,
  insertion-order eviction), `cachedValidatedCandidates()` caches the FULL
  `ValidatedCandidates` — candidates AND resolved finishes together (T-009 handoff,
  ADR-026). Only "ok" sets cached; infeasible/gate-blocked re-routes stay honest.
- `cache/reoptimize.ts` — `reoptimize(prev, change, input, catalog)` implementing the
  `KohlerEngine.reoptimize` contract (OPT §10.1): weights → pure re-score of the
  cached set (buildPlan re-measures C1–C8 on the argmax — nothing trusted from prev);
  fall-through to solve() when no validated set exists (relaxation protocol owns it);
  local → invalidation + bounded full re-search (ADR-028 deviation from §11.1.2 strip
  replacement — the bounded solver is ~350 ms typical, strip surgery has no clean seam
  on whole-bathroom candidates); global → solve().
- `objective/solve.ts` — `solvePlan` now flows through `cachedValidatedCandidates`
  (one-line change): a fresh solve warms the cache, so T-017 adjustment re-scores are
  instant. `validatedCandidates` itself unchanged.
- Engine barrel exports the cache module (top-level, not via objective/).
- Tests: `cache/cache.test.ts` — 9 tests: key excludes weight knobs + opens-reorder
  invariance + changes on every candidate-affecting dimension (polygon/openings/
  confirmed/features/budget/config), reoptimize weights == JSON-identical fresh solve
  under the new priority with re-score latency < 300 ms, no-stale-geometry check,
  local fallback fully revalidated onto the same deterministic plan, global == solve(),
  impossible-brief weights reopt routes through the honest wall, determinism cold vs
  warm cache.

## Design decisions (ADR-028)
- Cache key/payload/eviction and the local-edit fallback as above. OPT §11.1.2 strip
  replacement deliberately deferred: prototype posture (ADR-018) + latency evidence
  make the full re-search the simpler correct-by-construction route.

## Verification
- `npx vitest run packages/engine`: 189/189 pass (17 files; 9 new).
- `npx tsc --noEmit` (engine, web, server): all clean.
- `npm run build --workspace packages/engine`: clean.

## Handoff
- T-013 (AI adapter) does not touch the cache; narration stays receipt-bound (ADR-014).
- T-017 adjustment flow should call `reoptimize(prev, {kind:"weights"}, newInput, catalog)`
  for priority/spaciousness taps and `{kind:"local"}` for fixture/door changes; the
  receipt/topK inside the returned plan is already consistent.
- T-019 QA should attack: cache-key collisions across reordered constraint arrays
  (featureConstraints arrays are NOT id-sorted — order changes miss, never stale),
  eviction correctness at the 32-entry bound, and cross-brief cache isolation.
