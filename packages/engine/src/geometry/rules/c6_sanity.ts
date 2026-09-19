// C6 — Layout sanity (OPT §5): cross-cutting checks that are not pairwise
// fixture geometry:
//   (a) a door swing must not enter a fixture's front clearance: the in-swing
//       sector (same conservative model as C3, reusing swingSectorAabbMm) must
//       not intersect the front-corridor AABB of any fixture whose class has a
//       configured front clearance (c2 clearanceSpecFor + frontCorridorAabbMm
//       at the configured reach);
//   (b) no fixture may occupy a DOOR opening's span on the same wall (a
//       fixture standing in a doorway). Windows are excluded — a vanity under
//       a window is legal.
// Deltas: minDoorClearanceGapMm (min gap between door sectors and front
// corridors, measured even when passing) and doorway overlap amounts.
// Deterministic order: openings and placements sorted. Pure functions.

import type { AABB, BathroomRep } from "../../contracts/geometry.js";
import type { FixtureBinding } from "../../contracts/candidate.js";
import type { Config } from "../../config/config-types.js";
import type { RuleId, RuleVerdict } from "../../contracts/receipt.js";
import { EPSILON_MM } from "../../contracts/canonical.js";
import { aabbIntersectsMm } from "../aabb.js";
import { roundMm } from "../num.js";
import { boxGapMm, resolvePlacements, sortById } from "./common.js";
import { swingSectorAabbMm } from "./c3_swing.js";
import { clearanceSpecFor, frontCorridorAabbMm } from "./c2_clearance.js";

export function evaluateC6(
  candidateBindings: FixtureBinding[],
  rep: BathroomRep,
  config: Config,
): RuleVerdict {
  const valuesUsed = { ...config.rules.C6.values };
  const c2Values = config.rules.C2.values;
  const deltas: Record<string, number> = { minDoorClearanceGapMm: Infinity };
  const reasons: string[] = [];

  const { placements, failures } = resolvePlacements(candidateBindings, rep);
  for (const failure of failures) {
    reasons.push(`c6-${failure}`);
  }

  const doors = sortById(rep.openings).filter((o) => o.kind === "door");
  const doorSectors: { id: string; aabb: AABB }[] = [];
  for (const door of doors) {
    if (door.swing) {
      const sector = swingSectorAabbMm(door, rep);
      if (sector) doorSectors.push({ id: door.id, aabb: sector });
    }
  }

  // (a) Door swing vs fixture front clearance.
  for (const p of placements) {
    const frontSpec = clearanceSpecFor(p.binding.fixture.class).find(
      (s) => s.aspect === "front",
    );
    if (!frontSpec) continue;
    const reach = c2Values[frontSpec.key];
    if (typeof reach !== "number") continue;
    const corridor = frontCorridorAabbMm(p, reach);
    for (const sector of doorSectors) {
      deltas.minDoorClearanceGapMm = Math.min(
        deltas.minDoorClearanceGapMm,
        boxGapMm(sector.aabb, corridor),
      );
      if (aabbIntersectsMm(sector.aabb, corridor)) {
        reasons.push(`c6-door-blocks-clearance:${sector.id}:${p.binding.fixture.skuId}`);
      }
    }
  }

  // (b) Fixture in a doorway (strict overlap; touching within EPSILON_MM ok).
  for (const door of doors) {
    const strip = rep.strips.find((s) => s.id === door.wallId);
    if (!strip) {
      reasons.push(`c6-unknown-wall:${door.id}`);
      continue;
    }
    for (const p of placements) {
      if (p.strip.id !== strip.id) continue;
      const overlapMm = Math.max(
        Math.min(p.span.end, door.alongOffsetMm + door.spanMm) -
          Math.max(p.span.start, door.alongOffsetMm),
        0,
      );
      if (overlapMm > EPSILON_MM) {
        deltas[`doorwayOverlapMm:${p.binding.fixture.skuId}:${door.id}`] =
          roundMm(overlapMm);
        reasons.push(`c6-fixture-in-doorway:${p.binding.fixture.skuId}:${door.id}`);
      }
    }
  }

  if (deltas.minDoorClearanceGapMm === Infinity) deltas.minDoorClearanceGapMm = 0;
  deltas.minDoorClearanceGapMm = roundMm(deltas.minDoorClearanceGapMm);

  return {
    ruleId: "C6" satisfies RuleId,
    pass: reasons.length === 0,
    valuesUsed,
    measuredDeltas: deltas,
    explanation:
      reasons.length === 0 ? "c6-pass:layout-sane" : reasons.join(";"),
  };
}
