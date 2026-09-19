import { evaluateC1 } from "./c1_fit.js";
import { evaluateC2 } from "./c2_clearance.js";
import { evaluateC3 } from "./c3_swing.js";
import { evaluateC4 } from "./c4_zones.js";
import { evaluateC5 } from "./c5_plumbing.js";
import { evaluateC6 } from "./c6_sanity.js";
import type { BathroomRep } from "../../contracts/geometry.js";
import type { FixtureBinding } from "../../contracts/candidate.js";
import type { Config } from "../../config/config-types.js";
import type { RuleVerdict } from "../../contracts/receipt.js";

export { evaluateC1, evaluateC2, evaluateC3, evaluateC4, evaluateC5, evaluateC6 };

/**
 * Geometry validation layer (T-006): C1–C6 evaluated in canonical rule order
 * (OPT §5). The solver (T-008) calls this primitive; C7 (compatibility) and C8
 * (budget) are separate evaluators (T-007/T-009). Full trace — no
 * short-circuit: every fired rule records its verdict, so receipts can trace
 * each failure (PRD §10.4).
 */
export function evaluateGeometryRules(
  bindings: FixtureBinding[],
  rep: BathroomRep,
  config: Config,
): RuleVerdict[] {
  return [
    evaluateC1(bindings, rep, config),
    evaluateC2(bindings, rep, config),
    evaluateC3(bindings, rep, config),
    evaluateC4(bindings, rep, config),
    evaluateC5(bindings, rep, config),
    evaluateC6(bindings, rep, config),
  ];
}
