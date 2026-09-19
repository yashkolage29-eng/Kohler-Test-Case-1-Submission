// Wall-strip decomposition of a canonical room polygon (OPT §4, SYS-ARCH §5.1,
// ADR-003). Each polygon edge becomes a 1D strip with a deterministic id, origin at
// the lexicographically smallest endpoint (x, then y), and a unit axis direction —
// matching the convention in contracts/fixtures.ts ("wall-bottom" of the §16 room is
// origin (0,1800), direction (1,0)).
//
// Side names come from the outward normal of the polygon-order edge: top/bottom/left/
// right. L-shape duplicates get a deterministic numeric suffix ("-2", "-3") assigned
// after sorting the same-side strips by origin. Corner subtraction is zero by design:
// strips partition the outline corner-to-corner, so perpendicular strips overlap only
// at a point (measure zero) — no usable span is double-counted. Keep-clear regions
// (openings) are subtracted by openings.ts. Pure functions only.

import type { RoomPolygon, WallStrip, Vec2 } from "../contracts/geometry.js";
import { EPSILON_MM } from "../contracts/canonical.js";
import { roundMm } from "./num.js";

interface RawStrip {
  side: string;
  origin: Vec2;
  direction: Vec2;
  lengthMm: number;
}

/** Inward unit normal for a named wall side (into the room; y-down convention). */
export function stripInwardNormal(wallSide: string): Vec2 {
  switch (wallSide) {
    case "top":
      return { x: 0, y: 1 };
    case "bottom":
      return { x: 0, y: -1 };
    case "left":
      return { x: 1, y: 0 };
    case "right":
      return { x: -1, y: 0 };
    default:
      throw new Error(`stripInwardNormal: unknown wall side ${wallSide}`);
  }
}

/** Decompose a canonical (CCW, axis-aligned) polygon into deterministically ordered
 *  and identified wall strips. usableLengthMm starts at the full edge length. */
export function buildWallStrips(polygon: RoomPolygon): WallStrip[] {
  const n = polygon.vertices.length;
  const raw: RawStrip[] = [];
  for (let i = 0; i < n; i++) {
    const a = polygon.vertices[i];
    const b = polygon.vertices[(i + 1) % n];
    const dx = Math.sign(roundMm(b.x - a.x));
    const dy = Math.sign(roundMm(b.y - a.y));
    const side = SIDE_BY_EDGE_DELTA[`${dx},${dy}`];
    if (side === undefined) {
      throw new Error(`buildWallStrips: non-axis-aligned edge ${JSON.stringify([a, b])}`);
    }
    const origin = a.x < b.x || (a.x === b.x && a.y < b.y) ? a : b;
    const other = origin === a ? b : a;
    const dirX = Math.sign(roundMm(other.x - origin.x));
    const dirY = Math.sign(roundMm(other.y - origin.y));
    const lengthMm = roundMm(Math.abs(other.x - origin.x) + Math.abs(other.y - origin.y));
    raw.push({ side, origin, direction: { x: dirX, y: dirY }, lengthMm });
  }

  // Deterministic ids: same-side strips ordered by origin (x, then y); first keeps the
  // bare side name, later ones get "-2", "-3", …
  const bySide = new Map<string, RawStrip[]>();
  for (const strip of raw) {
    const list = bySide.get(strip.side) ?? [];
    list.push(strip);
    bySide.set(strip.side, list);
  }
  const strips: WallStrip[] = [];
  for (const [side, list] of bySide) {
    list.sort(
      (p, q) => p.origin.x - q.origin.x || p.origin.y - q.origin.y,
    );
    list.forEach((strip, index) => {
      strips.push({
        id: index === 0 ? `wall-${side}` : `wall-${side}-${index + 1}`,
        wallSide: side,
        origin: strip.origin,
        direction: strip.direction,
        usableLengthMm: strip.lengthMm,
      });
    });
  }
  // Canonical entity order (contracts/canonical.ts): sort by id ascending.
  return strips.sort((s, t) => (s.id < t.id ? -1 : s.id > t.id ? 1 : 0));
}

/** Room-space point at `alongMm` from the strip origin (canonical precision). */
export function stripPoint(strip: WallStrip, alongMm: number): Vec2 {
  if (!Number.isFinite(alongMm)) {
    throw new Error("stripPoint: non-finite alongMm");
  }
  return {
    x: roundMm(strip.origin.x + strip.direction.x * alongMm),
    y: roundMm(strip.origin.y + strip.direction.y * alongMm),
  };
}

/** Full edge length of a strip before keep-clear subtraction. */
export function stripLengthMm(strip: WallStrip): number {
  return strip.usableLengthMm;
}

/** Strict-interior 1D range overlap: touching within EPSILON_MM is NOT overlap. */
export function rangesIntersectMm(a0: number, a1: number, b0: number, b1: number): boolean {
  return (
    Math.max(Math.min(a0, a1), Math.min(b0, b1)) <
    Math.min(Math.max(a0, a1), Math.max(b0, b1)) - EPSILON_MM
  );
}

// Edge-delta → side name. For a canonical CCW (y-down) polygon the outward normal of
// an edge with delta (dx,dy) is (dy,-dx); these keys are the EDGE DELTAS, which CCW
// ordering makes unambiguous per side.
const SIDE_BY_EDGE_DELTA: Record<string, string> = {
  "1,0": "top",
  "0,1": "right",
  "-1,0": "bottom",
  "0,-1": "left",
};

