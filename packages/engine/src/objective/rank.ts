// Ranking (OPT §8.4/§12/§13.3): score every validated, finish-resolved candidate with
// the weighted objective, order by total desc, then apply the fixed tie-break policy —
// more space-efficiency → cheaper → fewer fixtures → lexicographic candidate id
// (OPT §13.3; no randomness, no flip). Pure functions only.
import type { Candidate, CandidateScore, Scores } from "../contracts/candidate.js";
import type { Config } from "../config/config-types.js";
import { weightedTotal } from "./scores.js";

/** A scored, finish-resolved candidate — the ranking input unit. */
export interface ScoredCandidate {
  candidate: Candidate;
  scores: Scores;
  total: number;
}

/** OPT §13.3 deterministic comparator (des descending, then the fixed policy). */
export function compareRanked(a: ScoredCandidate, b: ScoredCandidate): number {
  return (
    b.total - a.total ||
    b.scores.uSpace - a.scores.uSpace || // more space-efficiency first
    a.candidate.cost - b.candidate.cost || // then cheaper
    a.candidate.bindings.length - b.candidate.bindings.length || // then fewer fixtures
    (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0) // then lexicographic
  );
}

/** Rank scored candidates (OPT §8.4). Input order does not affect the result. */
export function rankCandidates(scored: ScoredCandidate[]): ScoredCandidate[] {
  return [...scored].sort(compareRanked);
}

/** Receipt top-k (OPT §12: k ≥ 3, config.topK). */
export function topK(ranked: ScoredCandidate[], config: Config): CandidateScore[] {
  return ranked
    .slice(0, config.topK)
    .map((s) => ({ candidateId: s.candidate.id, total: s.total, perTerm: s.scores }));
}

/** Score a finish-resolved candidate with the resolved weights. */
export function scoreWithWeights(
  candidate: Candidate,
  scores: Scores,
  weights: Scores,
): ScoredCandidate {
  return { candidate, scores, total: weightedTotal(scores, weights) };
}
