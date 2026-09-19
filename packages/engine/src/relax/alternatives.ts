// Ordinary-brief alternative priority profiles (T-010, ADR-020 mode 1, ADR-005):
// the "3 ways" stretch route. From the SAME validated, finish-resolved candidate set
// as the primary solve, each config weight profile (priority row + the input's
// bounded spaciousness modifier) re-scores and re-ranks the candidates; the argmax
// becomes a fully re-validated plan (buildPlan re-measures C1–C8). Output is the
// SEPARATE typed AlternativeProfilePlan — never a BuildOutput, never relaxation.
// Deterministic: profiles in closed PRIORITIES order, minus the effective primary
// (input.priority ?? DEFAULT_PRIORITY). Pure functions only.
import type { InputSet } from "../contracts/input.js";
import type { CatalogState } from "../catalog/schema.js";
import type { Scores } from "../contracts/candidate.js";
import type { AlternativeProfilePlan } from "../contracts/plan.js";
import { PRIORITIES } from "../contracts/vocab.js";
import { validatedCandidates } from "../objective/solve.js";
import { DEFAULT_PRIORITY, resolveWeights, scoreCandidate } from "../objective/scores.js";
import { rankCandidates, scoreWithWeights, topK } from "../objective/rank.js";
import { buildPlan } from "../objective/build-plan.js";

/** Deterministic per-priority-profile alternative plans for a valid brief. Empty
 *  when the brief itself cannot produce validated candidates (solve() owns that
 *  reporting through BuildOutput). */
export function alternativeProfiles(
  input: InputSet,
  catalog: CatalogState,
): AlternativeProfilePlan[] {
  const collected = validatedCandidates(input, catalog);
  if (collected.kind !== "ok") return [];
  const primary = input.priority ?? DEFAULT_PRIORITY;
  const { resolvedPairs, rep } = collected;

  const out: AlternativeProfilePlan[] = [];
  for (const profile of PRIORITIES) {
    if (profile === primary) continue;
    const { weights } = resolveWeights(input.config, profile, input.spaciousness);
    const scored = resolvedPairs.map(({ candidate, resolved }) =>
      scoreWithWeights(candidate, scoreCandidate(candidate, resolved, input, catalog), weights),
    );
    const ranked = rankCandidates(scored);
    if (ranked.length === 0) continue;
    const best = ranked[0];
    const bestPair = resolvedPairs.find((p) => p.candidate.id === best.candidate.id);
    if (bestPair === undefined) continue; // unreachable — defensive
    const receiptTopK = topK(ranked, input.config);
    const scoreMatrix: Record<string, Scores> = {};
    for (const s of ranked) scoreMatrix[s.candidate.id] = s.scores;
    out.push({
      profile,
      plan: buildPlan({
        best,
        resolved: bestPair.resolved,
        input,
        catalog,
        rep,
        topK: receiptTopK,
        scoreMatrix,
      }),
    });
  }
  return out;
}