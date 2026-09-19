import type { Priority, Spaciousness } from "./vocab.js";
// Plan & output contracts — mirrors SYS-ARCH §5.4 and OPT §3/§10.
// BuildOutput is the ONLY thing solve()/reoptimize() may return. There is no invalid
// plan shape: plan | relaxation menu | honest out-of-scope (ADR-015).

import type { Candidate, Scores } from "./candidate.js";
import type { DecisionReceipt, RuleVerdict } from "./receipt.js";

export interface LineItem {
  model_id: string; // catalog field naming kept per SYS-ARCH §5.4 seed
  qty: number;
  finish?: string;
  price: number; // INR integer
}

export interface BOM {
  lineItems: LineItem[];
  total: number; // ≤ B_max, enforced by C8
  byZone: Record<string, LineItem[]>;
}

export interface BudgetSummary {
  total: number;
  bTarget: number;
  bMax: number;
  /** Minimum budget raise required, present only when total > bTarget (OPT §3.3). */
  minRaiseRequired?: number;
}

export interface Plan {
  id: string;
  selectedCandidate: Candidate;
  firedTrace: RuleVerdict[];
  perTermScores: Scores;
  cost: number;
  /** BOM added to the §5.4 seed: OPT §3.2 makes the BOM a mandatory output and it needs
   *  a home inside Plan (addition recorded in ADR-022). */
  bom: BOM;
  budgetSummary: BudgetSummary;
  receipt: DecisionReceipt;
}

/** Relaxation kinds, hand-ordered menu (OPT §10.2.2). */
export type RelaxationKind =
  | "swap-sku"
  | "drop-feature"
  | "shrink-clearance"
  | "drop-class"
  | "raise-budget"
  | "move-door";

export interface RelaxationPlan {
  kind: RelaxationKind;
  /** Measured trade-off delta summary (engine-generated facts, OPT §12.1) — narration
   *  may rephrase but never add to it. */
  tradeoffDelta: string;
  /** Independently re-searched and fully re-validated plan (OPT §10.2.3). */
  plan: Plan;
}

/** 1–3 distinct valid relaxed plans; count enforced by the solver, not the type. */
export type RelaxationMenu = RelaxationPlan[];

/** Honest out-of-scope wall: names the final blocker + minimum viable cost (OPT §10.2.4).
 *  No fake plan, no crash, no silent best-effort. */
export interface OutOfScope {
  finalBlocker: string;
  minViableCost: number; // INR integer
}

/** Discriminated union (§5.4 seed was an undiscriminated union — kind added for usable
 *  exhaustiveness, recorded in ADR-022). */
export type BuildOutput =
  | { kind: "plan"; plan: Plan }
  | { kind: "relaxation"; menu: RelaxationMenu }
  | { kind: "out-of-scope"; outOfScope: OutOfScope };

/** Ordinary-brief alternative-profile plan (ADR-005/ADR-020 mode 1): a deterministic
 *  priority-profile alternative scored with a distinct config weight profile from the
 *  SAME validated candidate set. This is a SEPARATE typed output from the relaxation
 *  menu (ADR-020) — it never flows through BuildOutput and is never presented as
 *  recovery from an impossible brief. Produced by relax/alternativeProfiles(). */
export interface AlternativeProfilePlan {
  /** The config weight-profile row (config.weights[profile]) the plan was scored under. */
  profile: Priority;
  plan: Plan;
}

/** Re-optimization change classification (OPT §10.1): weight-only → re-score; local edit
 *  → re-place affected strip; global → full re-search. Final output always fully
 *  re-validated before surfacing. */
export type ReoptChange =
  | { kind: "weights"; priority?: Priority; spaciousness?: Spaciousness }
  | { kind: "local"; fixtureModelId?: string; openingId?: string }
  | { kind: "global" };
