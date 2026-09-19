// C2 — Clearances (OPT §5): per-class minimum working/access clearance in front of
// and beside fixtures. Values live in config.rules.C2.values (never hardcoded):
// front clearance is measured as an unobstructed corridor (clearDistanceMm) from the
// fixture's front face inward, laterally bounded by the footprint's along-wall span;
// side clearance (toilet/tub) is measured along the wall from both side edges,
// laterally bounded by the fixture's inward depth span. Blockers are the other
// fixture AABBs and rep.obstacles; walls come from polygon edges. Blockers behind
// the corridor start are filtered (blockersAhead) — clearDistanceMm would otherwise
// score a behind-blocker as entry 0. Faucet/accessory classes carry no clearance
// spec and are skipped. Measured values are capped at the required reach by
// clearDistanceMm, so exactly-at-threshold passes and 1 mm short fails. Deltas are
// measured even when passing. Deterministic order: placements via sortBindings. Pure.

import type { AABB } from "../../contracts/geometry.js";
import type { BathroomRep } from "../../contracts/geometry.js";
import type { FixtureBinding } from "../../contracts/candidate.js";
import type { Config } from "../../config/config-types.js";
import type { FixtureClass } from "../../contracts/vocab.js";
import type { RuleId, RuleVerdict } from "../../contracts/receipt.js";
import { EPSILON_MM } from "../../contracts/canonical.js";
import {
  blockersAhead,
  clearDistanceMm,
  resolvePlacements,
  type Placement,
} from "./common.js";
import { roundMm } from "../num.js";

export type ClearanceAspect = "front" | "side";

interface ClearanceSpec {
  aspect: ClearanceAspect;
  /** Key into config.rules.C2.values. */
  key: string;
}

/** Class → required clearances (C2_CONFIG.values keys; OPT §5 seeded values). */
const CLEARANCE_SPEC: Partial<Record<FixtureClass, ClearanceSpec[]>> = {
  toilet: [
    { aspect: "front", key: "toiletFrontMm" },
    { aspect: "side", key: "toiletSideMm" },
  ],
  basin: [{ aspect: "front", key: "basinFrontMm" }],
  vanity: [{ aspect: "front", key: "vanityFrontMm" }],
  shower: [{ aspect: "front", key: "showerEntryMm" }],
  tub: [{ aspect: "side", key: "tubSideMm" }],
};

/** The clearance spec for a class, or [] when the class carries none. */
export function clearanceSpecFor(fixtureClass: FixtureClass): ClearanceSpec[] {
  return CLEARANCE_SPEC[fixtureClass] ?? [];
}

export interface CorridorMeasure {
  travel: "x" | "y";
  dir: 1 | -1;
  from: number;
  lateral: { axis: "x" | "y"; start: number; end: number };
}

/** Corridor measurement parameters for one fixture and aspect. Front: the inward
 *  direction from the front face; side: both wall directions from the side edges. */
export function clearanceCorridors(
  placement: Placement,
  aspect: ClearanceAspect,
): CorridorMeasure[] {
  const { aabb, span, inward } = placement;
  if (aspect === "front") {
    const travel = inward.x !== 0 ? "x" : "y";
    const dir: 1 | -1 = (travel === "x" ? inward.x : inward.y) > 0 ? 1 : -1;
    const from =
      travel === "x" ? (dir === 1 ? aabb.max.x : aabb.min.x) : dir === 1 ? aabb.max.y : aabb.min.y;
    const lateral =
      travel === "x"
        ? { axis: "y" as const, start: aabb.min.y, end: aabb.max.y }
        : { axis: "x" as const, start: aabb.min.x, end: aabb.max.x };
    return [{ travel, dir, from, lateral }];
  }
  // Side: travel along the wall axis in both directions, laterally bounded by the
  // fixture's inward extent.
  const lateral =
    span.axis === "x"
      ? { axis: "y" as const, start: aabb.min.y, end: aabb.max.y }
      : { axis: "x" as const, start: aabb.min.x, end: aabb.max.x };
  return [
    { travel: span.axis, dir: -1, from: span.start, lateral },
    { travel: span.axis, dir: 1, from: span.end, lateral },
  ];
}

/** Front-clearance corridor AABB of a placement at the given reach (C6 reuses this
 *  for swing-vs-clearance checks): the footprint's along-wall span extended `reach`
 *  inward from the front face. */
export function frontCorridorAabbMm(placement: Placement, reachMm: number): AABB {
  const { aabb, inward } = placement;
  const travel = inward.x !== 0 ? "x" : "y";
  const inwardStep = travel === "x" ? inward.x : inward.y;
  const from = travel === "x" ? (inward.x > 0 ? aabb.max.x : aabb.min.x) : inward.y > 0 ? aabb.max.y : aabb.min.y;
  const to = from + inwardStep * reachMm;
  const lo = roundMm(Math.min(from, to));
  const hi = roundMm(Math.max(from, to));
  return travel === "x"
    ? { min: { x: lo, y: aabb.min.y }, max: { x: hi, y: aabb.max.y } }
    : { min: { x: aabb.min.x, y: lo }, max: { x: aabb.max.x, y: hi } };
}

export function evaluateC2(
  candidateBindings: FixtureBinding[],
  rep: BathroomRep,
  config: Config,
): RuleVerdict {
  const valuesUsed = { ...config.rules.C2.values };
  const values = config.rules.C2.values;
  const deltas: Record<string, number> = {};
  const reasons: string[] = [];
  const { placements, failures } = resolvePlacements(candidateBindings, rep);
  for (const failure of failures) {
    reasons.push(`c2-${failure}`);
  }

  const obstacleAabbs = rep.obstacles.map((o) => o.aabb);
  // Min measured clearance per class:aspect (measured even when passing).
  const minByAspect = new Map<string, number>();

  for (const p of placements) {
    const blockers = [
      ...placements.filter((q) => q !== p).map((q) => q.aabb),
      ...obstacleAabbs,
    ];
    for (const spec of clearanceSpecFor(p.binding.fixture.class)) {
      const required = values[spec.key];
      if (typeof required !== "number") {
        continue; // no configured value — no requirement to measure
      }
      let measured = Infinity;
      for (const corridor of clearanceCorridors(p, spec.aspect)) {
        const ahead = blockersAhead(blockers, corridor.travel, corridor.dir, corridor.from);
        const available = clearDistanceMm({
          rep,
          blockers: ahead,
          from: corridor.from,
          reach: required,
          travel: corridor.travel,
          dir: corridor.dir,
          lateral: corridor.lateral,
        });
        measured = Math.min(measured, available);
      }
      const key = `${p.binding.fixture.class}:${spec.aspect}`;
      minByAspect.set(key, Math.min(minByAspect.get(key) ?? measured, measured));
      if (measured + EPSILON_MM < required) {
        reasons.push(`c2-clearance-short:${p.binding.fixture.skuId}:${spec.aspect}`);
        deltas[`shortfallMm:${p.binding.fixture.skuId}:${spec.aspect}`] = roundMm(
          Math.max(required - measured, 0),
        );
      }
    }
  }
  for (const [key, mm] of [...minByAspect.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    deltas[`minMm:${key}`] = mm;
  }
  deltas.maxShortfallMm = roundMm(
    Math.max(
      0,
      ...Object.entries(deltas)
        .filter(([k]) => k.startsWith("shortfallMm:"))
        .map(([, v]) => v),
    ),
  );

  return {
    ruleId: "C2" satisfies RuleId,
    pass: reasons.length === 0,
    valuesUsed,
    measuredDeltas: deltas,
    explanation: reasons.length === 0 ? "c2-pass:all-clearances-met" : reasons.join(";"),
  };
}
