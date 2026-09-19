// Numeric core for the geometry module: canonical millimetre rounding and epsilon
// comparison (contracts/canonical.ts, SCHEMA §2.1). Pure functions only.

import { EPSILON_MM, MM_PRECISION_DP } from "../contracts/canonical.js";

/** Round to the canonical millimetre precision (MM_PRECISION_DP decimals, half-way
 *  cases per Math.round: toward +Infinity). Canonicalizes -0 to 0 and throws on
 *  non-finite input — determinism over silence, matching canonicalJson. */
export function roundMm(n: number): number {
  if (!Number.isFinite(n)) {
    throw new Error("roundMm: non-finite input");
  }
  const factor = 10 ** MM_PRECISION_DP;
  const rounded = Math.round(n * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

/** Epsilon comparison at the canonical tolerance: |a - b| <= EPSILON_MM (inclusive). */
export function approxEqMm(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON_MM;
}
