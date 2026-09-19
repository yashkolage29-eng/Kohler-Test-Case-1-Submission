// Relaxation menu assembly (OPT §10.2.3/§10.2.4, T-010, ADR-020 mode 2): each
// hand-ordered relaxation path is INDIVIDUALLY re-searched through the full solve
// pipeline (solvePlan — full C1–C8 re-validation by construction), valid results are
// deduped by plan id (distinct-plan check), and the menu is bounded to 1–3 plans.
// Exhaustion (no path yields a plan) routes to the honest out-of-scope wall naming
// the traced final blocker and the measured minimum viable cost. Deterministic:
// menu order = path hand order; no RNG, no wall-clock.
import type { InputSet } from "../contracts/input.js";
import type { CatalogState } from "../catalog/schema.js";
import type { BuildOutput, RelaxationMenu, RelaxationPlan } from "../contracts/plan.js";
import type { SolvePlanResult } from "../objective/solve.js";
import { minViableCost } from "../objective/solve.js";
import { relaxationPaths } from "./paths.js";
import type { FailDiagnosis } from "./diagnose.js";

/** OPT §10.2.3: 1–3 provably-valid relaxed plans. */
export const MAX_RELAXATION_PLANS = 3;

/** Run each hand-ordered path independently and assemble the menu. `trySolve` is the
 *  full solve pipeline (solvePlan) — injected by objective/solve.ts, which also
 *  consumes this function (module cycle is function-declaration-only, safe under
 *  ESM hoisting). */
export function buildRelaxationMenu(
  input: InputSet,
  catalog: CatalogState,
  diagnosis: FailDiagnosis,
  trySolve: (input: InputSet) => SolvePlanResult,
): BuildOutput {
  const menu: RelaxationMenu = [];
  const seen = new Set<string>();
  for (const path of relaxationPaths(input, catalog, diagnosis)) {
    if (menu.length >= MAX_RELAXATION_PLANS) break;
    const result = trySolve(path.input);
    if (result.kind !== "plan") continue; // this relaxation alone is insufficient
    if (seen.has(result.plan.id)) continue; // distinct-plan check (T-010)
    seen.add(result.plan.id);
    const relaxed: RelaxationPlan = {
      kind: path.kind,
      tradeoffDelta: path.tradeoffDelta,
      plan: result.plan,
    };
    menu.push(relaxed);
  }

  if (menu.length === 0) {
    // Honest out-of-scope wall (OPT §10.2.4): no fake plan, no silent best-effort.
    const causeText = diagnosis.causes
      .map((c) => (c.ruleId !== null ? `${c.ruleId}:${c.blocker}` : c.blocker))
      .join(";");
    return {
      kind: "out-of-scope",
      outOfScope: {
        finalBlocker: causeText.length > 0 ? `${diagnosis.reason}:${causeText}` : diagnosis.reason,
        minViableCost: minViableCost(input.config, catalog),
      },
    };
  }
  return { kind: "relaxation", menu };
}