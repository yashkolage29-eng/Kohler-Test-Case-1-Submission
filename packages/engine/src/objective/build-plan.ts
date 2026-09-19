// Plan assembly (OPT §3/§10/§12, SYS-ARCH §5.4): fill the Plan contract from the
// ranked argmax — fired-rule trace (selected candidate's full C1–C7 verdicts
// re-measured + C8), finish-aware BOM grouped by fixture class/zone, budget summary
// with the measured minimum raise, and the decision receipt. Deterministic; every
// number is a measured engine fact (ADR-014 — the AI narrates, never invents).
import type { Candidate } from "../contracts/candidate.js";
import type { InputSet } from "../contracts/input.js";
import type { BathroomRep } from "../contracts/geometry.js";
import type { BOM, BudgetSummary, LineItem, Plan } from "../contracts/plan.js";
import type { DecisionReceipt, RuleVerdict } from "../contracts/receipt.js";
import type { CatalogState } from "../catalog/schema.js";
import type { FixtureClass } from "../contracts/vocab.js";
import type { Scores } from "../contracts/candidate.js";
import { evaluateGeometryRules } from "../geometry/rules/index.js";
import { evaluateC7, c7FeatureSet } from "../rules/c7_compat.js";
import { sortBindings } from "../geometry/rules/common.js";
import { evaluateC8 } from "./c8.js";
import type { ResolvedFinishes } from "./finish.js";
import type { CandidateScore } from "../contracts/candidate.js";
import type { ScoredCandidate } from "./rank.js";

/** C8 explanation string for the plan receipt (OPT §12). */
export const HONESTY_FRAME =
  "planning-level, not a certificate — every number above is a measured engine fact (OPT §12)";

/** Finish-aware BOM (OPT §3.2): one line item per bound fixture, grouped by fixture
 *  class (zone grouping; SYS-ARCH §5.4 leaves zone buckets informal — classes are the
 *  deterministic bucket). Lines in canonical binding order. */
export function buildBom(candidate: Candidate, resolved: ResolvedFinishes): BOM {
  const lineItems: LineItem[] = [];
  const byZone = new Map<FixtureClass, LineItem[]>();
  for (const binding of sortBindings(candidate.bindings)) {
    const choice = resolved.choices.get(binding.fixture.skuId);
    const item: LineItem = {
      model_id: binding.fixture.skuId,
      qty: 1,
      finish: choice?.finish,
      price: choice?.price ?? 0,
    };
    lineItems.push(item);
    const bucket = byZone.get(binding.fixture.class);
    if (bucket) bucket.push(item);
    else byZone.set(binding.fixture.class, [item]);
  }
  const zones: Record<string, LineItem[]> = {};
  for (const [zoneClass, items] of byZone) zones[zoneClass] = items;
  const total = lineItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  return { lineItems, total, byZone: zones };
}

/** Budget summary (OPT §3.3): total vs B_target vs B_max + measured min raise. */
export function buildBudgetSummary(total: number, input: InputSet): BudgetSummary {
  const summary: BudgetSummary = {
    total,
    bTarget: input.budget.bTarget,
    bMax: input.budget.bMax,
  };
  if (total > input.budget.bTarget) {
    summary.minRaiseRequired = total - input.budget.bTarget; // OPT §3.3
  }
  return summary;
}

/** Full fired-rule trace for the selected candidate: re-measured C1–C6 + C7 verdicts
 *  plus the C8 budget verdict on the resolved total (OPT §5 — full trace, no
 *  short-circuit; re-measured deterministically, never trusted from the solver). */
export function firedTrace(
  candidate: Candidate,
  resolved: ResolvedFinishes,
  input: InputSet,
  rep: BathroomRep,
  catalog: CatalogState,
): RuleVerdict[] {
  return [
    ...evaluateGeometryRules(candidate.bindings, rep, input.config),
    evaluateC7(candidate.bindings, catalog, c7FeatureSet(input.featureConstraints), input.config),
    evaluateC8(resolved.cost, input.budget.bMax),
  ];
}

/** Assemble the Plan for the ranked argmax. */
export function buildPlan(args: {
  best: ScoredCandidate;
  resolved: ResolvedFinishes;
  input: InputSet;
  catalog: CatalogState;
  rep: BathroomRep;
  topK: CandidateScore[];
  scoreMatrix: Record<string, Scores>;
}): Plan {
  const { best, resolved, input, catalog, rep, topK, scoreMatrix } = args;
  const bom = buildBom(best.candidate, resolved);
  const trace = firedTrace(best.candidate, resolved, input, rep, catalog);
  const receipt: DecisionReceipt = {
    topK,
    scoreMatrix,
    firedRuleTrace: trace,
    dataGaps: [...catalog.dataGaps].sort(), // OPT §13.4 — catalog gaps surfaced honestly
    honestyFrame: HONESTY_FRAME,
  };
  return {
    id: `plan-${best.candidate.id}`,
    selectedCandidate: best.candidate,
    firedTrace: trace,
    perTermScores: best.scores,
    cost: resolved.cost,
    bom,
    budgetSummary: buildBudgetSummary(resolved.cost, input),
    receipt,
  };
}
