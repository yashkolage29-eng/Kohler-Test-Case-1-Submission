// C8 — Budget ceiling (OPT §5): a HARD per-complete-candidate rule. Deferred from
// T-008 (assemble.ts) because the true cost only exists after finish resolution
// (objective/finish.ts) — see the ADR-022-shaped split there. Pure function.
import type { RuleId, RuleVerdict } from "../contracts/receipt.js";

/** Measure C8 for a resolved total against the hard ceiling B_max. */
export function evaluateC8(total: number, bMax: number): RuleVerdict {
  const pass = total <= bMax;
  return {
    ruleId: "C8" satisfies RuleId,
    pass,
    valuesUsed: { bMax, total },
    measuredDeltas: { budgetHeadroomInr: bMax - total },
    explanation: pass
      ? `c8-pass:total-${total}-within-bmax-${bMax}`
      : `c8-fail:total-${total}-exceeds-bmax-${bMax}`,
  };
}
