// Engine call surface — type-only mirror of SYS-ARCH §6.1. NO implementations here:
// solve lands in T-008/T-009, validate in T-006/T-007, reoptimize/relax in T-010/T-011.
// All calls are typed in-process functions (ADR-001): no HTTP, no async, no AI authority.

import type { InputSet } from "./input.js";
import type { Candidate } from "./candidate.js";
import type { BuildOutput, Plan, ReoptChange, RelaxationMenu, OutOfScope } from "./plan.js";
import type { DecisionReceipt, ValidationResult } from "./receipt.js";

export interface KohlerEngine {
  /** Whole pipeline. Input must be Step-01 gate-passed (confirmed) with a validated
   *  catalog; infeasible → relaxationMenu, never an invalid plan, never a hang. */
  solve(input: InputSet): BuildOutput;
  /** C1–C8 validation of a candidate against the input; returns full trace either way. */
  validate(candidate: Candidate, input: InputSet): ValidationResult;
  /** Targeted incremental re-optimization (OPT §10.1); result fully re-validated. */
  reoptimize(prev: Plan, change: ReoptChange, input: InputSet): BuildOutput;
  /** Trace-driven relaxation protocol (OPT §10.2): 1–3 validated plans or honest
   *  out-of-scope. */
  relax(input: InputSet, blockers: ValidationResult): RelaxationMenu | OutOfScope;
  /** Deterministic decision receipt for a validated plan (ADR-014). */
  report(plan: Plan): DecisionReceipt;
}
