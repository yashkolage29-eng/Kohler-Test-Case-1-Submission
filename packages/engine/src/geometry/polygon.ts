// Room polygon normalization gate (OPT §2.1). Accepts the MVP room shapes —
// rectangle (4 vertices) or L-shape (6 vertices), axis-aligned only — and rewrites
// them to the canonical form: CCW (positive shoelace signed area under the y-down
// convention of contracts/fixtures.ts) starting at the lexicographically smallest
// vertex (x first, then y), all coordinates at canonical 1-dp precision.
//
// Rejections carry stable machine-readable reason strings. Checks run in a fixed
// order (a–h below) so the collected reason list is deterministic. Pure functions
// only: no DOM, no I/O, no globals, no randomness.

import { EPSILON_MM } from "../contracts/canonical.js";
import type { RoomPolygon, Vec2 } from "../contracts/geometry.js";
import { approxEqMm, roundMm } from "./num.js";

export type PolygonResult =
  | { ok: true; polygon: RoomPolygon }
  | { ok: false; reasons: string[] };

/** Shoelace signed area in mm². Positive means CCW under the project convention. */
export function polygonSignedAreaMm2(vertices: Vec2[]): number {
  let twice = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return twice / 2;
}

export function normalizeRoomPolygon(input: RoomPolygon): PolygonResult {
  const reasons: string[] = [];

  // (a) wall thickness must be finite and strictly positive.
  if (!Number.isFinite(input.wallThicknessMm) || input.wallThicknessMm <= 0) {
    reasons.push("invalid-wall-thickness");
  }

  // (b) vertex coordinates must be finite; then round to canonical precision.
  //     Non-finite geometry makes every later check meaningless — stop here.
  if (input.vertices.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    reasons.push("non-finite-vertex");
    return { ok: false, reasons };
  }
  let vertices = input.vertices.map((p) => ({ x: roundMm(p.x), y: roundMm(p.y) }));

  // (c) remove consecutive exact duplicates, including the wraparound pair.
  //     Fewer than 3 vertices cannot form a polygon — stop here.
  vertices = dedupConsecutive(vertices);
  if (vertices.length < 3) {
    reasons.push("vertex-count");
    return { ok: false, reasons };
  }

  // (d) MVP shapes only: rectangle (4) or L-shape (6).
  if (vertices.length !== 4 && vertices.length !== 6) {
    reasons.push("vertex-count");
  }

  const n = vertices.length;
  const dirs = vertices.map((_, i) => edgeDir(vertices[i], vertices[(i + 1) % n]));

  // (e) every edge axis-aligned: exactly one of dx, dy is zero.
  const axisAligned = dirs.every((d) => d !== "other");
  if (!axisAligned) {
    reasons.push("non-axis-aligned-edge");
  }

  // (f) no two consecutive edges collinear — ambiguous input, reported not fixed.
  for (let i = 0; i < n; i++) {
    const d0 = dirs[i];
    const d1 = dirs[(i + 1) % n];
    if (d0 !== "other" && d0 === d1) {
      reasons.push("collinear-edges");
      break;
    }
  }

  // (g) non-degenerate signed area.
  const signedArea = polygonSignedAreaMm2(vertices);
  if (Math.abs(signedArea) <= EPSILON_MM) {
    reasons.push("zero-area");
  }

  // (h) simplicity: no pair of non-adjacent edges may intersect (n ≤ 6, O(n²)).
  //     Only meaningful once edges are known to be axis-aligned.
  if (axisAligned && hasSelfIntersection(vertices)) {
    reasons.push("self-intersecting");
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  // (i) enforce CCW = positive signed area (y-down convention).
  if (signedArea < 0) {
    vertices = vertices.slice().reverse();
  }

  // (j) rotate so the lexicographically smallest vertex (x, then y) comes first.
  let start = 0;
  for (let i = 1; i < vertices.length; i++) {
    const c = vertices[i];
    const s = vertices[start];
    if (c.x < s.x || (c.x === s.x && c.y < s.y)) {
      start = i;
    }
  }
  vertices = vertices.slice(start).concat(vertices.slice(0, start));

  // (k) canonical polygon.
  return {
    ok: true,
    polygon: {
      vertices,
      ccw: true,
      wallThicknessMm: roundMm(input.wallThicknessMm),
    },
  };
}

type EdgeDir = "h" | "v" | "other";

/** Axis-aligned classification: "h"/"v" when exactly one of dx, dy is ~zero,
 *  "other" for diagonal or degenerate (zero-length) edges. */
function edgeDir(a: Vec2, b: Vec2): EdgeDir {
  const dxZero = approxEqMm(b.x - a.x, 0);
  const dyZero = approxEqMm(b.y - a.y, 0);
  if (dxZero === dyZero) return "other";
  return dxZero ? "v" : "h";
}

function dedupConsecutive(vertices: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of vertices) {
    const last = out[out.length - 1];
    if (last === undefined || last.x !== p.x || last.y !== p.y) {
      out.push(p);
    }
  }
  while (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first.x === last.x && first.y === last.y) {
      out.pop();
    } else {
      break;
    }
  }
  return out;
}

function hasSelfIntersection(vertices: Vec2[]): boolean {
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // skip adjacent edges (share a vertex), including the wraparound pair
      if (j === i + 1) continue;
      if (i === 0 && j === n - 1) continue;
      if (
        segmentsIntersectMm(
          vertices[i],
          vertices[(i + 1) % n],
          vertices[j],
          vertices[(j + 1) % n],
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Intersection for axis-aligned segments: exact via bounding-range overlap.
 *  Touching within EPSILON_MM counts as intersecting. */
function segmentsIntersectMm(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  return (
    rangesOverlapMm(p1.x, p2.x, p3.x, p4.x) &&
    rangesOverlapMm(p1.y, p2.y, p3.y, p4.y)
  );
}

function rangesOverlapMm(a0: number, a1: number, b0: number, b1: number): boolean {
  return (
    Math.min(a0, a1) <= Math.max(b0, b1) + EPSILON_MM &&
    Math.min(b0, b1) <= Math.max(a0, a1) + EPSILON_MM
  );
}

