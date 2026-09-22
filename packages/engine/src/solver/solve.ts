// Constructive solver entry (T-008): archetype layer → SKU binding layer →
// wall-strip placement CSP → measured candidate assembly. Deterministic pure
// function of InputSet + CatalogState (OPT §14). Scope boundary (task split):
// scoring/ranking/BOM/receipt are T-009; relaxation menus are T-010 — the
// infeasible result here carries measured blockers only, as a typed result.
import type { Candidate } from "../contracts/candidate.js";
import type { InputSet } from "../contracts/input.js";
import type { CatalogState } from "../catalog/schema.js";
import { buildBathroomRep } from "../geometry/room.js";
import { filterArchetypes } from "./archetypes.js";
import { bindSkus } from "./bind.js";
import { solvePlacements } from "./place.js";
import { assembleCandidate, candidateKey } from "./assemble.js";

/** T-032: placement variants of one SKU set score identically on every term except
 *  none (u_space is footprint-based), so a few valid layouts per set are enough; the
 *  shared node budget then reaches many more SKU sets instead of hundreds of layouts
 *  of the cheapest one. Planning-level caps. */
const PLACEMENTS_PER_SET = 48;
const VALID_PER_SET = 3;

/** Typed solver result (ranking-ready; scoring/receipts are T-009 scope). */
export type SolverResult =
  | { kind: "ok"; candidates: Candidate[] }
  | { kind: "infeasible"; reason: string; blockers: string[] }
  | { kind: "gate-blocked"; reasons: string[] };

/** Run the constructive solver. Never hangs: the shared backtracking budget
 *  bounds every search; exhaustion routes to the typed infeasibility. */
export function runConstructiveSolver(input: InputSet, catalog: CatalogState): SolverResult {
  // Step-01 gate (OPT §13.1): the solver never runs on unconfirmed input.
  if (!input.confirmed) {
    return { kind: "gate-blocked", reasons: ["input-not-confirmed"] };
  }

  const built = buildBathroomRep(input);
  if (!built.ok) {
    return { kind: "infeasible", reason: "invalid-input", blockers: built.reasons };
  }
  const rep = built.rep;

  const roomUsableLengthMm = rep.strips.reduce((total: number, s) => total + s.usableLengthMm, 0);
  const archetypes = filterArchetypes(input, catalog, roomUsableLengthMm);
  if (archetypes.length === 0) {
    return { kind: "infeasible", reason: "no-feasible-archetype", blockers: [] };
  }

  const budget = { nodes: input.config.backtrackBudget };
  const byKey = new Map<string, Candidate>();
  const blockerSet = new Set<string>();

  for (const arch of archetypes) {
    const skuSets = bindSkus(arch, input, catalog, budget);
    for (const skuSet of skuSets) {
      if (budget.nodes <= 0) break;
      const search = solvePlacements(skuSet, rep, input, budget, PLACEMENTS_PER_SET);
      for (const blocker of search.blockers) blockerSet.add(blocker);
      let valid = 0;
      for (const bindings of search.bindings) {
        const candidate = assembleCandidate(bindings, input, catalog, rep);
        if (candidate === null) continue; // failed full validation — never emitted
        byKey.set(candidateKey(candidate), candidate);
        if (++valid >= VALID_PER_SET) break;
      }
      if (budget.nodes <= 0) break;
    }
    if (budget.nodes <= 0) break;
  }

  if (budget.nodes <= 0 && byKey.size === 0) {
    return {
      kind: "infeasible",
      reason: "backtracking-budget-exhausted",
      blockers: sortedBlockers(blockerSet),
    };
  }

  const candidates = [...byKey.values()].sort(
    (a, b) =>
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) ||
      a.cost - b.cost ||
      (candidateKey(a) < candidateKey(b) ? -1 : 1),
  );
  if (candidates.length === 0) {
    return { kind: "infeasible", reason: "no-valid-candidate", blockers: sortedBlockers(blockerSet) };
  }
  return { kind: "ok", candidates };
}

function sortedBlockers(blockerSet: Set<string>): string[] {
  return [...blockerSet].sort();
}
