import { describe, expect, it } from "vitest";

import type { AABB, RoomPolygon, WallStrip, Vec2 } from "../contracts/geometry.js";
import { aabbForPlacement, aabbInsidePolygonMm, aabbIntersectsMm, pointInPolygonMm } from "./aabb.js";
import { buildWallStrips } from "./strips.js";

const v = (x: number, y: number): Vec2 => ({ x, y });
const polygon = (vertices: Vec2[]): RoomPolygon => ({
  vertices,
  ccw: true,
  wallThicknessMm: 100,
});
const RECT: Vec2[] = [v(0, 0), v(1500, 0), v(1500, 1800), v(0, 1800)];
const LSHAPE: Vec2[] = [
  v(0, 0),
  v(3000, 0),
  v(3000, 1200),
  v(1200, 1200),
  v(1200, 2400),
  v(0, 2400),
];

const strips: WallStrip[] = buildWallStrips(polygon(RECT));
const bottom = strips[0]; // wall-bottom: origin (0,1800), dir (1,0)
const top = strips.find((s) => s.id === "wall-top")!;
const left = strips.find((s) => s.id === "wall-left")!;

const box = (x0: number, y0: number, x1: number, y1: number): AABB => ({
  min: v(x0, y0),
  max: v(x1, y1),
});

describe("aabbForPlacement", () => {
  it("projects a toilet (w380 d700) on the bottom wall, orientation 0, back flush inward", () => {
    const result = aabbForPlacement(bottom, 0, { w: 380, d: 700 }, 0);
    expect(result).toEqual({
      ok: true,
      aabb: box(0, 1100, 380, 1800),
    });
  });

  it("projects along the strip origin offset", () => {
    const result = aabbForPlacement(bottom, 600, { w: 380, d: 700 }, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.aabb).toEqual(box(600, 1100, 980, 1800));
    }
  });

  it("swaps w/d at orientation 90 (same AABB as 270)", () => {
    const r90 = aabbForPlacement(bottom, 0, { w: 380, d: 700 }, 90);
    const r270 = aabbForPlacement(bottom, 0, { w: 380, d: 700 }, 270);
    expect(r90.ok).toBe(true);
    expect(r270.ok).toBe(true);
    if (r90.ok && r270.ok) {
      expect(r90.aabb).toEqual(box(0, 1420, 700, 1800));
      expect(canonicalEqual(r90.aabb, r270.aabb)).toBe(true);
    }
  });

  it("respects the inward normal of every wall side", () => {
    const rTop = aabbForPlacement(top, 0, { w: 380, d: 700 }, 0);
    expect(rTop.ok).toBe(true);
    if (rTop.ok) expect(rTop.aabb).toEqual(box(0, 0, 380, 700));
    const rLeft = aabbForPlacement(left, 0, { w: 380, d: 700 }, 0);
    expect(rLeft.ok).toBe(true);
    if (rLeft.ok) expect(rLeft.aabb).toEqual(box(0, 0, 700, 380));
  });

  it("rejects non-multiples of 90 and invalid footprints/positions", () => {
    expect(aabbForPlacement(bottom, 0, { w: 380, d: 700 }, 45)).toEqual({
      ok: false,
      reasons: ["unsupported-orientation"],
    });
    expect(aabbForPlacement(bottom, 0, { w: 0, d: 700 }, 0)).toEqual({
      ok: false,
      reasons: ["invalid-footprint"],
    });
    expect(aabbForPlacement(bottom, Number.NaN, { w: 380, d: 700 }, 0)).toEqual({
      ok: false,
      reasons: ["non-finite-position"],
    });
  });
});

function canonicalEqual(a: AABB, b: AABB): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

describe("aabbIntersectsMm", () => {
  it("touching within epsilon is NOT overlap (side-by-side is legal)", () => {
    expect(aabbIntersectsMm(box(0, 0, 380, 700), box(380, 0, 760, 700))).toBe(false);
  });

  it("a real overlap of 1 mm is detected", () => {
    expect(aabbIntersectsMm(box(0, 0, 380, 700), box(379, 0, 760, 700))).toBe(true);
  });

  it("diagonal separation is not overlap", () => {
    expect(aabbIntersectsMm(box(0, 0, 100, 100), box(200, 200, 300, 300))).toBe(false);
  });
});

describe("pointInPolygonMm", () => {
  const rect = polygon(RECT);
  const lshape = polygon(LSHAPE);

  it("interior, boundary (inside counts), and exterior", () => {
    expect(pointInPolygonMm(v(750, 900), rect)).toBe(true);
    expect(pointInPolygonMm(v(0, 900), rect)).toBe(true); // on wall
    expect(pointInPolygonMm(v(2000, 900), rect)).toBe(false);
  });

  it("L-shape: inside the main wing, outside the notch", () => {
    expect(pointInPolygonMm(v(600, 1800), lshape)).toBe(true); // x<1200 wing
    expect(pointInPolygonMm(v(600, 300), lshape)).toBe(true); // y<1200 wing
    expect(pointInPolygonMm(v(2000, 1800), lshape)).toBe(false); // notch void
    expect(pointInPolygonMm(v(1200, 1800), lshape)).toBe(true); // on the notch edge
  });
});

describe("aabbInsidePolygonMm", () => {
  const rect = polygon(RECT);
  const lshape = polygon(LSHAPE);

  it("accepts a fixture box flush on the bottom wall", () => {
    expect(aabbInsidePolygonMm(box(0, 1100, 380, 1800), rect)).toBe(true);
  });

  it("rejects a box poking outside the room", () => {
    expect(aabbInsidePolygonMm(box(0, 1700, 380, 1900), rect)).toBe(false);
  });

  it("accepts a box in the L-shape main wing and one spanning x=1200 below the notch", () => {
    expect(aabbInsidePolygonMm(box(600, 600, 1000, 1500), lshape)).toBe(true);
    expect(aabbInsidePolygonMm(box(1000, 600, 1400, 900), lshape)).toBe(true);
  });

  it("rejects a box inside the L-shape notch", () => {
    expect(aabbInsidePolygonMm(box(1300, 1300, 1500, 1500), lshape)).toBe(false);
  });

  it("rejects a box straddling into the notch", () => {
    expect(aabbInsidePolygonMm(box(1000, 1000, 1500, 1500), lshape)).toBe(false);
  });
});
