// C1 — Boundary/fit (OPT §5): fixture footprints sit fully inside the room
// polygon and never overlap each other. Deterministic order: bindings sorted
// by skuId then posAlongMm; pairs evaluated in that order. Deltas are measured
// even when passing: minPairGapMm (0 also when fewer than two fixtures —
// "no pairs" is recorded as 0, not a clearance) and maxOverhangMm (distance a
// box extends beyond the polygon's bounding box, 0 when inside). Pure functions.

import type { BathroomRep } from "../../contracts/geometry.js";
import type { FixtureBinding } from "../../contracts/candidate.js";
import type { Config } from "../../config/config-types.js";
import type { RuleId } from "../../contracts/receipt.js";
import type { RuleVerdict } from "../../contracts/receipt.js";
import { aabbInsidePolygonMm, aabbIntersectsMm } from "../aabb.js";
import { roundMm } from "../num.js";
import {
  boxGapMm,
  boxOverlapDepthMm,
  overhangOutsideBboxMm,
  Placement,
  resolvePlacement,
  sortBindings,
} from "./common.js";

/** A faucet whose footprint lies fully inside a basin on the same wall is mounted on
 *  that basin's deck (T-028) — one installed unit, not two overlapping fixtures. */
function deckMounted(faucet: Placement, basin: Placement): boolean {
  if (faucet.binding.fixture.class !== "faucet" || basin.binding.fixture.class !== "basin") return false;
  if (faucet.strip.id !== basin.strip.id) return false;
  const f = faucet.aabb;
  const h = basin.aabb;
  return f.min.x >= h.min.x && f.max.x <= h.max.x && f.min.y >= h.min.y && f.max.y <= h.max.y;
}

export function evaluateC1(
  candidateBindings: FixtureBinding[],
  rep: BathroomRep,
  config: Config,
): RuleVerdict {
  const valuesUsed = { ...config.rules.C1.values };
  const deltas: Record<string, number> = {
    maxOverhangMm: 0,
    minPairGapMm: Infinity,
  };
  const reasons: string[] = [];

  const placements: Placement[] = [];
  for (const binding of sortBindings(candidateBindings)) {
    const resolved = resolvePlacement(binding, rep);
    if (!resolved.ok) {
      reasons.push(`c1-${resolved.reason}`);
      continue;
    }
    placements.push(resolved.placement);
  }

  // Footprints fully inside the room polygon.
  for (const p of placements) {
    if (!aabbInsidePolygonMm(p.aabb, rep.polygon)) {
      reasons.push(`c1-fixture-outside-room:${p.binding.fixture.skuId}`);
      deltas.maxOverhangMm = Math.max(
        deltas.maxOverhangMm,
        overhangOutsideBboxMm(p.aabb, rep),
      );
    }
  }

  // No overlap between fixtures (strict; touching is legal).
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i];
      const b = placements[j];
      if (deckMounted(a, b) || deckMounted(b, a)) continue;
      if (aabbIntersectsMm(a.aabb, b.aabb)) {
        reasons.push(
          `c1-fixture-overlap:${a.binding.fixture.skuId}/${b.binding.fixture.skuId}`,
        );
        deltas.minPairGapMm = Math.min(
          deltas.minPairGapMm,
          -boxOverlapDepthMm(a.aabb, b.aabb),
        );
      } else {
        deltas.minPairGapMm = Math.min(deltas.minPairGapMm, boxGapMm(a.aabb, b.aabb));
      }
    }
  }

  if (deltas.minPairGapMm === Infinity) {
    deltas.minPairGapMm = 0; // fewer than two fixtures — "no pairs", not a clearance
  }
  deltas.minPairGapMm = roundMm(deltas.minPairGapMm);

  return {
    ruleId: "C1" satisfies RuleId,
    pass: reasons.length === 0,
    valuesUsed,
    measuredDeltas: deltas,
    explanation:
      reasons.length === 0
        ? "c1-pass:all-footprints-inside-room-no-overlap"
        : reasons.join(";"),
  };
}
