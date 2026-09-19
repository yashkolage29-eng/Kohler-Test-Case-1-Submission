// Fixture footprint → authoritative 2D AABB (ADR-003: the wall-strip 1D model is the
// search core; AABBs in room coordinates are the authoritative collision/render layer).
// A fixture sits with its back flush on the wall line, extending inward along the
// strip's inward normal: at orientation 0/180 the footprint width w runs along the
// wall and depth d inward; at 90/270 they swap (both yield the same AABB — mirrored
// boxes are identical). Only multiples of 90° are supported in the MVP; anything else
// is rejected deterministically. Pure functions only.

import { EPSILON_MM } from "../contracts/canonical.js";
import type { AABB, RoomPolygon, Vec2, WallStrip } from "../contracts/geometry.js";
import { roundMm } from "./num.js";
import { stripInwardNormal, stripPoint } from "./strips.js";

export type AabbResult =
  | { ok: true; aabb: AABB }
  | { ok: false; reasons: string[] };

/** Project a fixture placement onto an axis-aligned room-space AABB. Inputs are used
 *  as given (the caller owns slot-grid snapping via snapToSlotMm); outputs are
 *  canonical 1-dp millimetres. */
export function aabbForPlacement(
  strip: WallStrip,
  posAlongMm: number,
  footprintMm: { w: number; d: number },
  orientationDeg: number,
): AabbResult {
  const reasons: string[] = [];
  if (!Number.isFinite(posAlongMm)) {
    reasons.push("non-finite-position");
  }
  if (
    !Number.isFinite(footprintMm.w) ||
    !Number.isFinite(footprintMm.d) ||
    footprintMm.w <= 0 ||
    footprintMm.d <= 0
  ) {
    reasons.push("invalid-footprint");
  }
  if (!Number.isInteger(orientationDeg / 90)) {
    reasons.push("unsupported-orientation");
  }
  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  const alongWall = orientationDeg % 180 === 0 ? footprintMm.w : footprintMm.d;
  const inwardDepth = orientationDeg % 180 === 0 ? footprintMm.d : footprintMm.w;
  const inward = stripInwardNormal(strip.wallSide);
  const p0 = stripPoint(strip, posAlongMm);
  const p1 = stripPoint(strip, posAlongMm + alongWall);
  const corners: Vec2[] = [
    p0,
    p1,
    { x: p0.x + inward.x * inwardDepth, y: p0.y + inward.y * inwardDepth },
    { x: p1.x + inward.x * inwardDepth, y: p1.y + inward.y * inwardDepth },
  ];
  const aabb: AABB = {
    min: {
      x: roundMm(Math.min(...corners.map((c) => c.x))),
      y: roundMm(Math.min(...corners.map((c) => c.y))),
    },
    max: {
      x: roundMm(Math.max(...corners.map((c) => c.x))),
      y: roundMm(Math.max(...corners.map((c) => c.y))),
    },
  };
  return { ok: true, aabb };
}

/** Strict AABB overlap: touching within EPSILON_MM is NOT overlap (side-by-side
 *  fixtures share a boundary legally). */
export function aabbIntersectsMm(a: AABB, b: AABB): boolean {
  return (
    a.min.x < b.max.x - EPSILON_MM &&
    b.min.x < a.max.x - EPSILON_MM &&
    a.min.y < b.max.y - EPSILON_MM &&
    b.min.y < a.max.y - EPSILON_MM
  );
}

/** Point-in-polygon for the closed axis-aligned room polygon: on the boundary counts
 *  as inside; otherwise a deterministic +x ray cast (PNPOLY, half-open y rule). */
export function pointInPolygonMm(p: Vec2, polygon: RoomPolygon): boolean {
  const v = polygon.vertices;
  const n = v.length;
  for (let i = 0; i < n; i++) {
    const a = v[i];
    const b = v[(i + 1) % n];
    if (onSegmentMm(p, a, b)) {
      return true;
    }
  }
  let inside = false;
  for (let i = 0; i < n; i++) {
    const a = v[i];
    const b = v[(i + 1) % n];
    if (a.y > p.y !== b.y > p.y) {
      const xAtY = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (p.x < xAtY) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function onSegmentMm(p: Vec2, a: Vec2, b: Vec2): boolean {
  const crossX = Math.abs(b.x - a.x) <= EPSILON_MM; // vertical edge
  const lo = crossX
    ? Math.min(a.y, b.y)
    : Math.min(a.x, b.x);
  const hi = crossX
    ? Math.max(a.y, b.y)
    : Math.max(a.x, b.x);
  const coord = crossX ? p.y : p.x;
  const fixed = crossX ? p.x : p.y;
  const fixedMatch = crossX
    ? Math.abs(a.x - fixed) <= EPSILON_MM
    : Math.abs(a.y - fixed) <= EPSILON_MM;
  return fixedMatch && coord >= lo - EPSILON_MM && coord <= hi + EPSILON_MM;
}

/** Axis-aligned box fully inside (or on) the closed polygon. Correct for concave
 *  L-shapes: all four corners inside AND no polygon edge crossing the box interior. */
export function aabbInsidePolygonMm(box: AABB, polygon: RoomPolygon): boolean {
  const corners: Vec2[] = [
    box.min,
    { x: box.max.x, y: box.min.y },
    { x: box.min.x, y: box.max.y },
    box.max,
  ];
  if (!corners.every((c) => pointInPolygonMm(c, polygon))) {
    return false;
  }
  const v = polygon.vertices;
  const n = v.length;
  for (let i = 0; i < n; i++) {
    if (edgeEntersBoxInteriorMm(v[i], v[(i + 1) % n], box)) {
      return false;
    }
  }
  return true;
}

/** Does an axis-aligned polygon edge pass through the OPEN interior of the box? */
function edgeEntersBoxInteriorMm(a: Vec2, b: Vec2, box: AABB): boolean {
  const vertical = Math.abs(b.x - a.x) <= EPSILON_MM;
  if (vertical) {
    const inX = a.x > box.min.x + EPSILON_MM && a.x < box.max.x - EPSILON_MM;
    const yLo = Math.min(a.y, b.y);
    const yHi = Math.max(a.y, b.y);
    return inX && yLo < box.max.y - EPSILON_MM && yHi > box.min.y + EPSILON_MM;
  }
  const inY = a.y > box.min.y + EPSILON_MM && a.y < box.max.y - EPSILON_MM;
  const xLo = Math.min(a.x, b.x);
  const xHi = Math.max(a.x, b.x);
  return inY && xLo < box.max.x - EPSILON_MM && xHi > box.min.x + EPSILON_MM;
}

