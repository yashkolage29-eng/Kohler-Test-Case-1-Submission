// Fail-cause tracing (OPT §10.2.1, T-010): the typed solver infeasibility (reason +
// measured blocker strings) is mapped onto hard-rule causes with a category, a
// narration-safe explanation, and the measured minimum gaps where computable — the
// budget deficit (minViableCost − B_max) and the per-key C2 shrink headroom between
// the configured value and its legal floor. Deterministic: causes dedupe on the
// verbatim blocker string, order by category rank then blocker. Pure functions only.
import type { RuleId } from "../contracts/receipt.js";
import type { InputSet } from "../contracts/input.js";
import type { CatalogState } from "../catalog/schema.js";
import { minViableCost, validatedCandidates } from "../objective/solve.js";

export type FailCategory =
  | "budget"
  | "clearance"
  | "fit"
  | "compatibility"
  | "search-exhausted"
  | "other";

/** One traced fail cause: rule id when the blocker names a hard rule, category for
 *  the relaxation layer, the verbatim measured blocker, and a narration-safe note. */
export interface FailCause {
  ruleId: RuleId | null;
  category: FailCategory;
  blocker: string; // verbatim solver blocker/reason — a measured fact
  explanation: string;
}

/** Category rank for deterministic cause ordering (menu-order neighbors). */
const CAUSE_ORDER: readonly FailCategory[] = [
  "budget",
  "clearance",
  "fit",
  "compatibility",
  "search-exhausted",
  "other",
];

export interface FailDiagnosis {
  reason: string; // verbatim solver reason
  blockers: string[]; // verbatim solver blockers (sorted by the solver)
  causes: FailCause[];
  /** Measured minimum gaps (OPT §10.2.1), present only when positive/known. */
  minGaps: {
    /** minViableCost − B_max in INR, when the cheapest class-minimum set exceeds B_max. */
    budgetDeficitInr?: number;
    /** Per-C2-key headroom (configured value − legal floor) in mm. */
    clearanceShrinkHeadroomMm?: Record<string, number>;
  };
}

/** Trace a typed solver infeasibility into ordered causes + measured minimum gaps. */
export function diagnoseFailures(
  input: InputSet,
  catalog: CatalogState,
  reason: string,
  blockers: string[],
): FailDiagnosis {
  const causes = new Map<string, FailCause>();
  const add = (
    ruleId: RuleId | null,
    category: FailCategory,
    blocker: string,
    explanation: string,
  ): void => {
    if (!causes.has(blocker)) causes.set(blocker, { ruleId, category, blocker, explanation });
  };

  // Placement-layer forward-check blockers (solver/place.ts, verbatim).
  for (const blocker of blockers) {
    const sku = blocker.includes(":") ? blocker.slice(blocker.indexOf(":") + 1) : blocker;
    if (blocker.startsWith("fc-outside-room:") || blocker.startsWith("fc-overlap:")) {
      add("C1", "fit", blocker, `${sku} could not be placed inside the room without a boundary or overlap violation`);
    } else if (blocker.startsWith("fc-front-clearance-short:")) {
      add("C2", "clearance", blocker, `required working clearance could not be met for ${sku}`);
    } else if (blocker.startsWith("fc-rough-in-opening:")) {
      add("C5", "fit", blocker, `${sku} could not keep its plumbing point clear of a door, window or other fixture on the wall`);
    } else if (blocker.startsWith("fc-invalid-placement:")) {
      add("C2", "clearance", blocker, `${sku} has no legal slot on any wall strip at the configured clearances`);
    } else {
      add(null, "other", blocker, "unclassified measured placement blocker");
    }
  }

  // Reason-level causes (no placement blockers were recorded).
  if (reason === "no-feasible-archetype") {
    add(null, "fit", reason, "no archetype template survives the taste, room-size, and budget pre-filter");
  } else if (reason === "backtracking-budget-exhausted") {
    add(null, "search-exhausted", reason, "the bounded search exhausted its backtracking budget before completing a valid candidate");
  } else if (reason === "no-valid-candidate" && causes.size === 0) {
    add(null, "other", reason, "the search completed but no candidate passed full validation");
  } else if (reason === "no-finish-consistent-candidate") {
    add(null, "compatibility", reason, "every candidate failed finish-family consistency or the true-cost C8 gate");
  }

  // Measured minimum gaps (OPT §10.2.1).
  const minGaps: FailDiagnosis["minGaps"] = {};
  const estimate = minViableCost(input.config, catalog);
  // T-032: the per-class cheapest set is only an estimate — with a mandatory shower it
  // often has no valid layout. T-040: it also ignores the taste's pinned classes (a vanity
  // chosen on a low budget). Measure the cheapest buildable plan for this brief instead.
  const minCost = estimate > input.budget.bMax || reason === "no-feasible-archetype"
    ? cheapestBuildableCost(input, catalog) ?? estimate
    : estimate;
  if (minCost > input.budget.bMax) {
    minGaps.budgetDeficitInr = minCost - input.budget.bMax;
    add(
      "C8",
      "budget",
      "budget-deficit",
      `the cheapest buildable set costs INR ${minCost}, exceeding B_max by INR ${minGaps.budgetDeficitInr}`,
    );
  }
  const c2 = input.config.rules.C2;
  if (c2.minLegal !== undefined) {
    const headroom: Record<string, number> = {};
    for (const [key, value] of Object.entries(c2.values)) {
      const floor = c2.minLegal[key];
      if (typeof floor === "number" && floor < value) headroom[key] = value - floor;
    }
    if (Object.keys(headroom).length > 0) minGaps.clearanceShrinkHeadroomMm = headroom;
  }

  const ordered = [...causes.values()].sort(
    (a, b) =>
      CAUSE_ORDER.indexOf(a.category) - CAUSE_ORDER.indexOf(b.category) ||
      (a.blocker < b.blocker ? -1 : a.blocker > b.blocker ? 1 : 0),
  );
  return { reason, blockers, causes: ordered, minGaps };
}

/** T-040: budget ceilings tried in turn, as multiples of B_max. An unlimited ceiling alone
 *  can exhaust the bounded search on premium sets before it reaches the cheap layout. */
const CEILING_STEPS = [1.25, 1.5, 2, 3, 5, Infinity];

/** Cost of the cheapest validated, finish-resolved candidate for this room and taste under
 *  the first lifted ceiling that solves; null when nothing is buildable at any price. */
function cheapestBuildableCost(input: InputSet, catalog: CatalogState): number | null {
  for (const step of CEILING_STEPS) {
    const ceiling = Number.isFinite(step) ? Math.ceil(input.budget.bMax * step) : Number.MAX_SAFE_INTEGER;
    const collected = validatedCandidates({ ...input, budget: { bTarget: ceiling, bMax: ceiling } }, catalog);
    if (collected.kind === "ok") return Math.min(...collected.resolvedPairs.map((p) => p.resolved.cost));
  }
  return null;
}
