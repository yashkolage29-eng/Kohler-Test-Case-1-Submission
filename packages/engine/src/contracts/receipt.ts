// Rule verdict + decision-receipt contracts — mirrors SYS-ARCH §5.5 and OPT §12.
// The receipt is the ONLY fact-set the AI may narrate (ADR-014).

import type { CandidateScore, Scores } from "./candidate.js";
import type { RelaxationMenu } from "./plan.js";

/** Hard rules C1–C8 (OPT §5). */
export type RuleId = "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8";

export const RULE_IDS: readonly RuleId[] = [
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
  "C7",
  "C8",
];

/** Every verdict carries the rule id, the config values used, the measured deltas, a
 *  human-readable explanation, and pass/fail (T-006 acceptance language, PRD §10.4).
 *  Validators return measured facts, never bare booleans. */
export interface RuleVerdict {
  ruleId: RuleId;
  pass: boolean;
  valuesUsed: Record<string, number>;
  measuredDeltas: Record<string, number>;
  explanation: string;
}

export interface ValidationResult {
  trace: RuleVerdict[];
  pass: boolean;
}

export interface DecisionReceipt {
  topK: CandidateScore[];
  scoreMatrix: Record<string, Scores>;
  firedRuleTrace: RuleVerdict[];
  constraintsTension?: string[];
  /** Quarantined SKUs / catalog gaps surfaced honestly (OPT §13.4). */
  dataGaps: string[];
  relaxationMenu?: RelaxationMenu;
  minBudget?: number;
  honestyFrame?: string;
}
