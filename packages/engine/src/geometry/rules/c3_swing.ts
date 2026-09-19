// C3 — Door swing (OPT §5): door-swing arcs must not collide with fixtures,
// walls, or other swings. Model: each opening with `swing` sweeps a quarter
// disc of radius leafDimsMm.w hinged at the opening's start point on its wall
// strip (documented assumption — hinge end is not in the contract; the start
// is the deterministic strip-direction origin of the opening span), rotating
// inward (side "in") or outward (side "out"). The sector is evaluated via its
// conservative AABB, so a blocker that only clips the sector's bounding box
// but not the disc still counts as a collision — conservative by design.
// Collision margin from config.rules.C3.values.collisionMarginMm: blockers
// within margin of the sector count as colliding. In-swing sectors must stay
// inside the room polygon (wall collision); out-swing sectors leave the
// modeled region, so the wall check is skipped for them. Deltas are measured
// even when passing: minGapMm across sector-blocker pairs and wallPokeMm.
// Openings whose wallId has no strip are dangling → fail. Pure functions.

import type { AABB, BathroomRep, Opening } from "../../contracts/geometry.js";
import type { Config } from "../../config/config-types.js";
import type { FixtureBinding } from "../../contracts/candidate.js";
import type { RuleId, RuleVerdict } from "../../contracts/receipt.js";
import { aabbInsidePolygonMm, aabbIntersectsMm } from "../aabb.js";
import { roundMm } from "../num.js";
import { stripInwardNormal, stripPoint } from "../strips.js";
import {
  boxGapMm,
  inflateAabbMm,
  overhangOutsideBboxMm,
  resolvePlacements,
  sortById,
} from "./common.js";

/** Conservative AABB of an opening's swing sector (quarter disc of radius
 *  leafDimsMm.w hinged at the opening start; inward for side "in", outward for
 *  side "out"). Openings without a swing yield null. */
export function swingSectorAabbMm(opening: Opening, rep: BathroomRep): AABB | null {
  if (!opening.swing) return null;
  const strip = rep.strips.find((s) => s.id === opening.wallId);
  if (!strip) return null;
  const hinge = stripPoint(strip, opening.alongOffsetMm);
  const dir = strip.direction;
  const inward = stripInwardNormal(strip.wallSide);
  const out = opening.swing.side === "in" ? inward : { x: -inward.x, y: -inward.y };
  const r = opening.swing.leafDimsMm.w;
  const corners = [
    hinge,
    { x: hinge.x + dir.x * r, y: hinge.y + dir.y * r },
    { x: hinge.x + out.x * r, y: hinge.y + out.y * r },
    { x: hinge.x + dir.x * r + out.x * r, y: hinge.y + dir.y * r + out.y * r },
  ];
  return {
    min: { x: roundMm(Math.min(...corners.map((c) => c.x))), y: roundMm(Math.min(...corners.map((c) => c.y))) },
    max: { x: roundMm(Math.max(...corners.map((c) => c.x))), y: roundMm(Math.max(...corners.map((c) => c.y))) },
  };
}

export function evaluateC3(
  candidateBindings: FixtureBinding[],
  rep: BathroomRep,
  config: Config,
): RuleVerdict {
  const valuesUsed = { ...config.rules.C3.values };
  const marginMm = valuesUsed.collisionMarginMm ?? 0;
  const deltas: Record<string, number> = { minGapMm: Infinity, wallPokeMm: 0 };
  const reasons: string[] = [];

  const { placements, failures } = resolvePlacements(candidateBindings, rep);
  for (const failure of failures) {
    reasons.push(`c3-${failure}`);
  }
  const blockerBoxes: { label: string; aabb: AABB }[] = [
    ...placements.map((p) => ({ label: p.binding.fixture.skuId, aabb: p.aabb })),
    ...sortById(rep.obstacles).map((o) => ({ label: o.id, aabb: o.aabb })),
  ];

  const openings = sortById(rep.openings);
  const sectors: { id: string; aabb: AABB; swing: NonNullable<Opening["swing"]> }[] = [];
  for (const opening of openings) {
    if (!opening.swing) continue;
    const sector = swingSectorAabbMm(opening, rep);
    if (!sector) {
      reasons.push(`c3-unknown-wall:${opening.id}`);
      continue;
    }
    sectors.push({ id: opening.id, aabb: sector, swing: opening.swing });

    // Fixtures and obstacles (with collision margin).
    const inflated = inflateAabbMm(sector, marginMm);
    for (const blocker of blockerBoxes) {
      deltas.minGapMm = Math.min(deltas.minGapMm, boxGapMm(sector, blocker.aabb));
      if (aabbIntersectsMm(inflated, blocker.aabb)) {
        reasons.push(`c3-swing-collision:${opening.id}:${blocker.label}`);
      }
    }

    // Walls: in-swing sectors must remain inside the room polygon. Touching
    // the wall at the hinge line is inside (boundary counts), so only sectors
    // cutting through a wall (e.g. across an L-shape notch) fail here.
    if (opening.swing.side === "in" && !aabbInsidePolygonMm(sector, rep.polygon)) {
      reasons.push(`c3-swing-wall:${opening.id}`);
      deltas.wallPokeMm = Math.max(deltas.wallPokeMm, overhangOutsideBboxMm(sector, rep));
    }
  }

  // Swing vs swing (any pair of openings).
  for (let i = 0; i < sectors.length; i++) {
    for (let j = i + 1; j < sectors.length; j++) {
      const a = sectors[i];
      const b = sectors[j];
      deltas.minGapMm = Math.min(deltas.minGapMm, boxGapMm(a.aabb, b.aabb));
      if (
        aabbIntersectsMm(inflateAabbMm(a.aabb, marginMm), inflateAabbMm(b.aabb, marginMm))
      ) {
        reasons.push(`c3-swing-swing:${a.id}:${b.id}`);
      }
    }
  }

  if (deltas.minGapMm === Infinity) deltas.minGapMm = 0; // no swings / no blockers
  deltas.minGapMm = roundMm(deltas.minGapMm);
  deltas.wallPokeMm = roundMm(deltas.wallPokeMm);

  return {
    ruleId: "C3" satisfies RuleId,
    pass: reasons.length === 0,
    valuesUsed,
    measuredDeltas: deltas,
    explanation:
      reasons.length === 0 ? "c3-pass:all-swings-clear" : reasons.join(";"),
  };
}
