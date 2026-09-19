# T-009 — Objective, BOM, ranking, and receipt (2026-09-15)

Owner: orchestrator; implemented by backend-agent (delegation hit the GLM daily rate
limit mid-run and completed most of the implementation but wrote no tests); the
orchestrator reviewed the agent's code, kept it, and completed the task directly by
writing the test suite and updating project state.

## Recovery note
The backend-agent delegation failed with `INFERENCE_CAP_ERROR` after ~35 iterations.
Following the T-008 lesson, the tree was diffed BEFORE re-attempting: the agent had
written the full `packages/engine/src/objective/` module (finish, c8, scores, rank,
build-plan, solve, index) and wired the engine barrel — but no tests. Work was kept
and verified line-by-line rather than re-delegated.

## What was done
- `objective/finish.ts` — deterministic finish resolution (the discovered T-009 gap:
  candidates carried no finish, so the BOM/C8/u_cost could not see true cost).
  Eligibility by finish family; shared-family harmony; cheapest-then-lexicographic
  pick; resolved cost = priceByFinish override ?? base; over-ceiling candidates drop.
  Now recorded as ADR-026.
- `objective/c8.ts` — the C8 RuleVerdict evaluator deferred from T-008 (valuesUsed
  bMax/total, measured headroom, typed explanation).
- `objective/scores.ts` — five anchored utilities per OPT §6/§7 (u_cost anchored on
  B_target/B_max; u_space on spare-floor fraction [0,1]; u_water on eco-gold vs
  catalog-worst; u_luxury/u_maintenance on config-anchored point scales), weight
  resolution with the ADR-006 bounded spaciousness modifier on u_space only, config
  defaults for undefined priority/spaciousness ("balanced").
- `objective/rank.ts` — total desc + OPT §13.3 tie-break (u_space → cheaper → fewer
  fixtures → lexicographic id); receipt top-k bounded by config.topK (3).
- `objective/build-plan.ts` — Plan assembly: re-measured C1–C7 trace + C8 on the
  resolved cost, finish-aware BOM grouped by fixture class, budget summary with
  minRaiseRequired = total − B_target when over target, decision receipt (topK,
  scoreMatrix, dataGaps from catalog state, honesty frame).
- `objective/solve.ts` — top-level `solve(): BuildOutput` consuming
  `runConstructiveSolver`: plan path; typed infeasibility → honest out-of-scope with a
  documented min-viable-cost estimate (cheapest SKU per class × archetype min counts);
  gate-blocked propagates through the out-of-scope wall. Relaxation menus are T-010.
- Engine barrel exports the objective module.
- Tests: `objective/objective.test.ts` — 14 tests (plan validity/BOM=receipt
  consistency, receipt completeness incl. C8, top-k bounds/order, anchor stability
  (isolated score == in-solve score), budget-edge minRaise, run-twice determinism,
  latency < 2 s, priority oracle (luxury ≥ value on u_luxury; value ≤ luxury on cost),
  tie-break comparator matrix, out-of-scope + gate propagation, C8 pass/fail,
  finish resolution integrity).

## Verification
- `npx vitest run packages/engine`: 164/164 pass (15 files; 14 new).
- `npx tsc --noEmit` (engine): clean.
- Typical 2400×1800 end-to-end `solve()`: ~350 ms (acceptance ≤ 2 s); deterministic.

## Handoff
- T-010 consumes the typed infeasible blockers for relaxation menus; solve() already
  returns BuildOutput, so the relaxation kind slots in without contract changes.
- T-011 must cache resolved finishes alongside candidates (ADR-026 consequence).
- T-013 narrates ONLY the receipt fact-set (ADR-014).
- T-019 QA should attack the finish-harmony shared-family policy and the min-viable-
  cost estimate (cost-only, not placement-feasible by construction).
