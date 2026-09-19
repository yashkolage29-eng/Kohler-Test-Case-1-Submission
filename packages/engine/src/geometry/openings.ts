// Opening validation and keep-clear subtraction (OPT §2/§4, SYS-ARCH §5.1).
// Openings are placed along a wall strip: alongOffsetMm from the strip origin,
// spanMm long. Keep-clear subtracts the opening span exactly — swing-arc conflicts
// are C3's job (T-006), corner subtraction is zero (see strips.ts). Validation
// collects stable reason strings in a fixed order (a–e), deduplicated while
// preserving first occurrence; openings are canonically sorted by id before any
// set computation. Pure functions only.

import { EPSILON_MM } from "../contracts/canonical.js";
import type { Opening, WallStrip } from "../contracts/geometry.js";
import { roundMm } from "./num.js";
import { rangesIntersectMm } from "./strips.js";

export type OpeningsResult =
  | { ok: true; openings: Opening[] }
  | { ok: false; reasons: string[] };

/** Validate openings against full-length strips; returns them sorted by id. */
export function validateOpenings(openings: Opening[], strips: WallStrip[]): OpeningsResult {
  const byId = new Map(strips.map((s) => [s.id, s]));
  const sorted = [...openings].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const reasons: string[] = [];
  const push = (reason: string) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  for (const opening of sorted) {
    // (a) finiteness
    if (
      !Number.isFinite(opening.alongOffsetMm) ||
      !Number.isFinite(opening.spanMm) ||
      (opening.swing !== undefined &&
        (!Number.isFinite(opening.swing.leafDimsMm.w) ||
          !Number.isFinite(opening.swing.leafDimsMm.d)))
    ) {
      push("non-finite-opening");
      continue;
    }
    // (b) positive span, non-negative offset
    if (opening.spanMm <= 0) {
      push("invalid-span");
      continue;
    }
    if (opening.alongOffsetMm < 0) {
      push("invalid-offset");
      continue;
    }
    // (c) wall must exist
    const strip = byId.get(opening.wallId);
    if (strip === undefined) {
      push("unknown-wall");
      continue;
    }
    // (d) opening must fit on the wall (epsilon-inclusive)
    if (opening.alongOffsetMm + opening.spanMm > strip.usableLengthMm + EPSILON_MM) {
      push("opening-outside-wall");
      continue;
    }
    // (e) swing fields, when present
    if (
      opening.swing !== undefined &&
      opening.swing.side !== "in" &&
      opening.swing.side !== "out"
    ) {
      push("invalid-swing");
      continue;
    }
  }

  // Overlap between openings on the same wall (all pairs; touching is allowed).
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (a.wallId === b.wallId && rangesIntersectMm(a.alongOffsetMm, a.alongOffsetMm + a.spanMm, b.alongOffsetMm, b.alongOffsetMm + b.spanMm)) {
        push("overlapping-openings");
      }
    }
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }
  return { ok: true, openings: sorted };
}

/** Return strips with usableLengthMm reduced by the spans of openings on each wall.
 *  Openings must be validated (non-overlapping, on-wall) before calling. */
export function subtractKeepClear(strips: WallStrip[], openings: Opening[]): WallStrip[] {
  const keepClearByWall = new Map<string, number>();
  for (const opening of openings) {
    keepClearByWall.set(
      opening.wallId,
      (keepClearByWall.get(opening.wallId) ?? 0) + opening.spanMm,
    );
  }
  return strips.map((strip) => ({
    ...strip,
    usableLengthMm: roundMm(strip.usableLengthMm - (keepClearByWall.get(strip.id) ?? 0)),
  }));
}

