// Slot-grid projection (OPT §4/§9): positions discretize onto the config slot grid
// (default 25 mm). Rounding is nearest, half-way cases toward +Infinity — consistent
// with roundMm — and results are canonical 1-dp millimetres. Invalid input throws
// (determinism over silence, matching num.ts). Pure functions only.

import { roundMm } from "./num.js";

/** Snap a millimetre position to the nearest multiple of gridMm. */
export function snapToSlotMm(posMm: number, gridMm: number): number {
  if (!Number.isFinite(posMm)) {
    throw new Error("snapToSlotMm: non-finite position");
  }
  if (!Number.isFinite(gridMm) || gridMm <= 0) {
    throw new Error("snapToSlotMm: invalid grid");
  }
  return roundMm(Math.round(posMm / gridMm) * gridMm);
}
