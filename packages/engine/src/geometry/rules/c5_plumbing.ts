// C5 — Plumbing minima (OPT §5): minimum distances between fixture
// connections/rough-ins and openings. Documented assumptions (rough-in points
// are not catalog data in the MVP):
// - A fixture's rough-in point is the CENTER OF ITS BACK FACE (the edge flush
//   on the wall strip) — deterministic derivation from the placement.
// - Rough-in-bearing classes: toilet, basin, shower, tub (a vanity hosts the
//   basin; faucet/accessory carry no rough-in).
// Checks (all values from config.rules.C5.values):
//   (a) same-strip pairwise rough-in separation ≥ minRoughInSeparationMm;
//   (b) rough-in to any door/window span on the same strip ≥
//       minRoughInSeparationMm (a rough-in cannot sit inside an opening);
//   (c) when the room declares plumbing zones matching the fixture's accepted
//       kinds on its strip, the rough-in must lie within
//       maxPlumbingWallDistanceMm of the nearest such zone-span center
//       (plumbing reach); no matching zones → check skipped for that fixture.
// Deltas: minRoughInSeparationMm, minOpeningSeparationMm, maxPlumbingReachMm —
// measured even when passing. Deterministic order: sortBindings, zones by id.
// Pure functions.

import type { BathroomRep, Vec2 } from "../../contracts/geometry.js";
import type { FixtureBinding } from "../../contracts/candidate.js";
import type { FixtureClass } from "../../contracts/vocab.js";
import type { Config } from "../../config/config-types.js";
import type { RuleId, RuleVerdict } from "../../contracts/receipt.js";
import { EPSILON_MM } from "../../contracts/canonical.js";
import { roundMm } from "../num.js";
import { stripPoint } from "../strips.js";
import { Placement, resolvePlacements, sortById } from "./common.js";

const ROUGH_IN_CLASSES: ReadonlySet<FixtureClass> = new Set([
  "toilet",
  "basin",
  "shower",
  "tub",
]);

/** Center of the placement's back face (flush on the wall line). */
export function roughInPointMm(p: Placement): Vec2 {
  const { aabb, inward } = p;
  if (inward.x !== 0) {
    const backX = inward.x > 0 ? aabb.min.x : aabb.max.x;
    return { x: backX, y: roundMm((aabb.min.y + aabb.max.y) / 2) };
  }
  const backY = inward.y > 0 ? aabb.min.y : aabb.max.y;
  return { x: roundMm((aabb.min.x + aabb.max.x) / 2), y: backY };
}

export function evaluateC5(
  candidateBindings: FixtureBinding[],
  rep: BathroomRep,
  config: Config,
): RuleVerdict {
  const valuesUsed = { ...config.rules.C5.values };
  const minSep = valuesUsed.minRoughInSeparationMm;
  const maxReach = valuesUsed.maxPlumbingWallDistanceMm;
  const deltas: Record<string, number> = {
    minRoughInSeparationMm: Infinity,
    minOpeningSeparationMm: Infinity,
    maxPlumbingReachMm: 0,
  };
  const reasons: string[] = [];

  const { placements, failures } = resolvePlacements(candidateBindings, rep);
  for (const failure of failures) {
    reasons.push(`c5-${failure}`);
  }

  const rough = placements
    .filter((p) => ROUGH_IN_CLASSES.has(p.binding.fixture.class))
    .map((p) => ({ placement: p, point: roughInPointMm(p) }));

  // (a) Same-strip pairwise separation.
  for (let i = 0; i < rough.length; i++) {
    for (let j = i + 1; j < rough.length; j++) {
      const a = rough[i];
      const b = rough[j];
      if (a.placement.strip.id !== b.placement.strip.id) continue;
      const dist = Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y);
      deltas.minRoughInSeparationMm = Math.min(
        deltas.minRoughInSeparationMm,
        dist,
      );
      if (typeof minSep === "number" && dist + EPSILON_MM < minSep) {
        reasons.push(
          `c5-rough-in-crowding:${a.placement.binding.fixture.skuId}:${b.placement.binding.fixture.skuId}`,
        );
      }
    }
  }

  // (b) Rough-in vs opening spans on the same strip (along-wall distance).
  const openings = sortById(rep.openings);
  for (const r of rough) {
    const origin = r.placement.strip.origin;
    const coord =
      r.placement.strip.direction.x !== 0 ? r.point.x - origin.x : r.point.y - origin.y;
    for (const opening of openings) {
      if (opening.wallId !== r.placement.strip.id) continue;
      const spanStart = opening.alongOffsetMm;
      const spanEnd = opening.alongOffsetMm + opening.spanMm;
      const dist = Math.max(spanStart - coord, coord - spanEnd, 0);
      deltas.minOpeningSeparationMm = Math.min(deltas.minOpeningSeparationMm, dist);
      if (typeof minSep === "number" && dist + EPSILON_MM < minSep) {
        reasons.push(
          `c5-rough-in-in-opening:${r.placement.binding.fixture.skuId}:${opening.id}`,
        );
      }
    }
  }

  // (c) Plumbing reach: rough-in to nearest matching zone-span center on its strip.
  const zones = sortById(rep.plumbingZones);
  for (const r of rough) {
    const accepted = r.placement.binding.fixture.zones;
    const matching = zones.filter(
      (z) => accepted.includes(z.kind) && z.wallStripId === r.placement.strip.id,
    );
    if (matching.length === 0) continue;
    let best = Infinity;
    for (const z of matching) {
      const centerMm = (z.spanStartMm + z.spanEndMm) / 2;
      const center = stripPoint(r.placement.strip, centerMm);
      best = Math.min(best, Math.hypot(center.x - r.point.x, center.y - r.point.y));
    }
    deltas.maxPlumbingReachMm = Math.max(deltas.maxPlumbingReachMm, best);
    if (typeof maxReach === "number" && best > maxReach + EPSILON_MM) {
      reasons.push(`c5-plumbing-reach:${r.placement.binding.fixture.skuId}`);
    }
  }

  if (deltas.minRoughInSeparationMm === Infinity) deltas.minRoughInSeparationMm = 0;
  if (deltas.minOpeningSeparationMm === Infinity) deltas.minOpeningSeparationMm = 0;
  deltas.minRoughInSeparationMm = roundMm(deltas.minRoughInSeparationMm);
  deltas.minOpeningSeparationMm = roundMm(deltas.minOpeningSeparationMm);
  deltas.maxPlumbingReachMm = roundMm(deltas.maxPlumbingReachMm);

  return {
    ruleId: "C5" satisfies RuleId,
    pass: reasons.length === 0,
    valuesUsed,
    measuredDeltas: deltas,
    explanation:
      reasons.length === 0 ? "c5-pass:plumbing-minima-met" : reasons.join(";"),
  };
}
