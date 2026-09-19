// Targeted incremental re-optimization (T-011, OPT §10.1, ADR-016):
//   weights change (priority/spaciousness) → pure re-score of the CACHED validated,
//     finish-resolved candidate set — no geometry work, no staleness possible because
//     the cache key excludes exactly these knobs and covers everything else;
//   local change → cache invalidation + bounded full re-search (documented deviation:
//     OPT §11.1.2's "replace affected strip" is deferred — the bounded constructive
//     solver already lands ~350 ms typical, well inside PRD N3's ~2 s, and a full
//     re-search is correct by construction; see ADR-028);
//   global change → full re-search via solve().
// Every returned output is the fully re-measured pipeline output (buildPlan re-runs
// C1–C8 on the argmax; relaxation paths re-search through solvePlan) — nothing is
// trusted from the previous plan. Deterministic pure functions; no UI, no network.
import type { InputSet } from "../contracts/input.js";
import type { CatalogState } from "../catalog/schema.js";
import type { BuildOutput, Plan, ReoptChange } from "../contracts/plan.js";
import type { Scores } from "../contracts/candidate.js";
import { candidateCache, cachedValidatedCandidates } from "./cache.js";
import { resolveWeights, scoreCandidate } from "../objective/scores.js";
import { rankCandidates, scoreWithWeights, topK } from "../objective/rank.js";
import { buildPlan } from "../objective/build-plan.js";
import { budgetInputErrors, solve } from "../objective/solve.js";

/** Re-score-only plan assembly from a cached candidate set under the input's current
 *  weights. The plan is fully re-validated (buildPlan re-measures C1–C8). */
function rescorePlan(input: InputSet, catalog: CatalogState): BuildOutput | null {
  const collected = cachedValidatedCandidates(input, catalog);
  if (collected.kind !== "ok") return null; // infeasible/gate-blocked → solve() owns it
  const { resolvedPairs, rep } = collected;
  const { weights } = resolveWeights(input.config, input.priority, input.spaciousness);
  const scored = resolvedPairs.map(({ candidate, resolved }) =>
    scoreWithWeights(candidate, scoreCandidate(candidate, resolved, input, catalog), weights),
  );
  const ranked = rankCandidates(scored);
  if (ranked.length === 0) return null;
  const best = ranked[0];
  const bestPair = resolvedPairs.find((p) => p.candidate.id === best.candidate.id);
  if (bestPair === undefined) return null; // unreachable — defensive
  const receiptTopK = topK(ranked, input.config);
  const scoreMatrix: Record<string, Scores> = {};
  for (const s of ranked) scoreMatrix[s.candidate.id] = s.scores;
  const plan: Plan = buildPlan({
    best,
    resolved: bestPair.resolved,
    input,
    catalog,
    rep,
    topK: receiptTopK,
    scoreMatrix,
  });
  return { kind: "plan", plan };
}

/** Incremental re-optimization entry (SYS-ARCH §6.1 reoptimize). `input` is the
 *  UPDATED InputSet; `change` classifies what moved (OPT §10.1). */
export function reoptimize(
  _prev: Plan,
  change: ReoptChange,
  input: InputSet,
  catalog: CatalogState,
): BuildOutput {
  if (budgetInputErrors(input).length > 0) return solve(input, catalog);
  switch (change.kind) {
    case "weights": {
      // Weight-only: hit the cache by key construction and re-score. If the brief
      // cannot produce a validated set (it could not before either), fall through
      // to solve() so the relaxation protocol / honest wall owns the reporting.
      return rescorePlan(input, catalog) ?? solve(input, catalog);
    }
    case "local": {
      // Local edit: the cached set for this geometry may reference the changed
      // fixture/opening — invalidate, then the bounded full re-search is the
      // correct-by-construction fallback (ADR-028).
      cachedValidatedCandidates(input, catalog); // ensure the stale entry exists, then drop it
      candidateCache.invalidate(input, catalog);
      return solve(input, catalog);
    }
    case "global":
      return solve(input, catalog);
  }
}
