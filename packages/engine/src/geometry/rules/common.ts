// Shared helpers for the C1–C6 rule evaluators (T-006). Pure functions only.
//
// Placement model: a binding's footprint is projected onto its wall strip via
// aabbForPlacement (ADR-003) — back flush on the wall, extending inward along the
// strip's inward normal. Deterministic iteration order: bindings sorted by
// fixture.skuId then posAlongMm (code-unit ascending); any unordered collection
// (zones, openings) is sorted by id (contracts/canonical.ts).
//
// Touching within EPSILON_MM is NOT overlap/collision, matching aabb.ts convention.

import { EPSILON_MM } from "../../contracts/canonical.js";
import type { AABB, BathroomRep, Vec2, WallStrip } from "../../contracts/geometry.js";
import type { FixtureBinding } from "../../contracts/candidate.js";
import { aabbForPlacement } from "../aabb.js";
import { roundMm } from "../num.js";
import { stripInwardNormal, stripPoint } from "../strips.js";

/** Canonical evaluation order for bindings. */
export function sortBindings(bindings: FixtureBinding[]): FixtureBinding[] {
  return [...bindings].sort(
    (a, b) =>
      (a.fixture.skuId < b.fixture.skuId
        ? -1
        : a.fixture.skuId > b.fixture.skuId
          ? 1
          : 0) ||
      a.posAlongMm - b.posAlongMm ||
      a.orientation - b.orientation,
  );
}

/** A resolved binding: its strip, projected AABB, and derived extents. */
export interface Placement {
  binding: FixtureBinding;
  strip: WallStrip;
  aabb: AABB;
  /** Footprint extent along the wall (w at 0/180, d at 90/270). */
  alongWallMm: number;
  /** Footprint extent inward from the wall. */
  inwardDepthMm: number;
  inward: Vec2;
  /** Footprint span [start, end] along the strip (strip-local coordinates). */
  span: { axis: "x" | "y"; start: number; end: number };
}

export type PlacementResult =
  | { ok: true; placement: Placement }
  | { ok: false; reason: string };

/** Resolve a binding against the room representation. Stable failure reasons. */
export function resolvePlacement(
  binding: FixtureBinding,
  rep: BathroomRep,
): PlacementResult {
  const strip = rep.strips.find((s) => s.id === binding.wallStripId);
  if (!strip) {
    return { ok: false, reason: `unknown-wall-strip:${binding.fixture.skuId}` };
  }
  const result = aabbForPlacement(
    strip,
    binding.posAlongMm,
    binding.fixture.footprintMm,
    binding.orientation,
  );
  if (!result.ok) {
    return { ok: false, reason: `invalid-placement:${binding.fixture.skuId}` };
  }
  const { w, d } = binding.fixture.footprintMm;
  const alongWallMm = binding.orientation % 180 === 0 ? w : d;
  const inwardDepthMm = binding.orientation % 180 === 0 ? d : w;
  const inward = stripInwardNormal(strip.wallSide);
  const spanAxis: "x" | "y" = strip.direction.x !== 0 ? "x" : "y";
  const start = stripPoint(strip, binding.posAlongMm);
  const end = stripPoint(strip, binding.posAlongMm + alongWallMm);
  return {
    ok: true,
    placement: {
      binding,
      strip,
      aabb: result.aabb,
      alongWallMm,
      inwardDepthMm,
      inward,
      span: {
        axis: spanAxis,
        start: spanAxis === "x" ? start.x : start.y,
        end: spanAxis === "x" ? end.x : end.y,
      },
    },
  };
}

/** Resolve every binding against the room; canonical order, stable failure reasons.
 *  Unresolvable bindings are skipped and surfaced as `reason` strings so each rule
 *  can prefix them (`cN-<reason>`) like C1 does. */
export function resolvePlacements(
  bindings: FixtureBinding[],
  rep: BathroomRep,
): { placements: Placement[]; failures: string[] } {
  const placements: Placement[] = [];
  const failures: string[] = [];
  for (const binding of sortBindings(bindings)) {
    const resolved = resolvePlacement(binding, rep);
    if (resolved.ok) {
      placements.push(resolved.placement);
    } else {
      failures.push(resolved.reason);
    }
  }
  return { placements, failures };
}

/** Blockers strictly ahead of `from` in direction `dir` along `travel` (touching
 *  within EPSILON_MM does not count as ahead). clearDistanceMm treats behind
 *  blockers as entry 0, so corridors must pre-filter them. */
export function blockersAhead(
  blockers: AABB[],
  travel: "x" | "y",
  dir: 1 | -1,
  from: number,
): AABB[] {
  return blockers.filter((b) =>
    dir === 1 ? b.min[travel] > from + EPSILON_MM : b.max[travel] < from - EPSILON_MM,
  );
}

/** Separation distance between two AABBs: 0 when they intersect or touch. */
export function boxGapMm(a: AABB, b: AABB): number {
  const dx = Math.max(b.min.x - a.max.x, a.min.x - b.max.x, 0);
  const dy = Math.max(b.min.y - a.max.y, a.min.y - b.max.y, 0);
  return roundMm(Math.max(dx, dy));
}

/** Overlap depth of two intersecting AABBs (min of per-axis overlaps). */
export function boxOverlapDepthMm(a: AABB, b: AABB): number {
  return roundMm(
    Math.min(
      Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x),
      Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y),
    ),
  );
}

/** AABB inflated by a margin on every side (C3 collision margin). */
export function inflateAabbMm(box: AABB, marginMm: number): AABB {
  return {
    min: { x: roundMm(box.min.x - marginMm), y: roundMm(box.min.y - marginMm) },
    max: { x: roundMm(box.max.x + marginMm), y: roundMm(box.max.y + marginMm) },
  };
}

export interface ClearDistanceParams {
  rep: BathroomRep;
  /** Other fixture AABBs that may block the corridor. */
  blockers: AABB[];
  /** Coordinate along the travel axis where the clearance starts (fixture front). */
  from: number;
  /** Required clearance distance (upper bound of the measured corridor). */
  reach: number;
  /** Travel axis and direction (the clearance direction, unit axis step). */
  travel: "x" | "y";
  dir: 1 | -1;
  /** Lateral span of the corridor along the travel-perpendicular axis. */
  lateral: { axis: "x" | "y"; start: number; end: number };
}

/**
 * Measure the unobstructed distance along a corridor from `from` in direction
 * `dir`, up to `reach`. Walls (polygon edges perpendicular to the travel axis
 * whose lateral span strictly overlaps the corridor) and blocker AABBs that
 * strictly overlap the corridor laterally count as obstructions. Returns
 * exactly `reach` when the corridor is clear. Axis-aligned polygon + travel
 * make this exact — no sampling. Touching within EPSILON_MM does not block.
 */
export function clearDistanceMm(params: ClearDistanceParams): number {
  const { rep, blockers, from, reach, travel, dir, lateral } = params;
  let available = reach;

  for (const blocker of blockers) {
    const bLo = travel === "x" ? blocker.min.y : blocker.min.x;
    const bHi = travel === "x" ? blocker.max.y : blocker.max.x;
    if (!lateralOverlaps(lateral, bLo, bHi)) continue;
    const near = dir === 1 ? blocker.min[travel] : blocker.max[travel];
    const entry = dir === 1 ? near - from : from - near;
    if (entry > reach + EPSILON_MM) continue;
    available = Math.min(available, Math.max(entry, 0));
  }

  const v = rep.polygon.vertices;
  for (let i = 0; i < v.length; i++) {
    const a = v[i];
    const b = v[(i + 1) % v.length];
    // Walls ahead are edges perpendicular to the travel axis (constant
    // travel-axis coordinate): horizontal edges for travel "y", vertical for "x".
    const isWall =
      travel === "y"
        ? Math.abs(b.y - a.y) <= EPSILON_MM
        : Math.abs(b.x - a.x) <= EPSILON_MM;
    if (!isWall) continue;
    const coord = travel === "y" ? a.y : a.x;
    const ahead = dir === 1 ? coord > from + EPSILON_MM : coord < from - EPSILON_MM;
    if (!ahead) continue;
    const eLo = travel === "y" ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
    const eHi = travel === "y" ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
    if (!lateralOverlaps(lateral, eLo, eHi)) continue;
    const distance = dir === 1 ? coord - from : from - coord;
    available = Math.min(available, distance);
  }

  return roundMm(available);
}

function lateralOverlaps(
  lateral: { axis: "x" | "y"; start: number; end: number },
  lo: number,
  hi: number,
): boolean {
  // Strict overlap: touching within EPSILON_MM is not blocking (side-by-side
  // fixtures must not eat each other's front clearance).
  return Math.max(lateral.start, lo) < Math.min(lateral.end, hi) - EPSILON_MM;
}

/** Distance from an AABB beyond the polygon's axis-aligned bounding box — a
 *  conservative overhang measure (0 when the box is inside the polygon bbox). */
export function overhangOutsideBboxMm(box: AABB, rep: BathroomRep): number {
  const v = rep.polygon.vertices;
  const minX = Math.min(...v.map((p) => p.x));
  const maxX = Math.max(...v.map((p) => p.x));
  const minY = Math.min(...v.map((p) => p.y));
  const maxY = Math.max(...v.map((p) => p.y));
  return roundMm(
    Math.max(minX - box.min.x, box.max.x - maxX, minY - box.min.y, box.max.y - maxY, 0),
  );
}

/** Sorted-by-id view of a collection (canonical entity order). */
export function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
