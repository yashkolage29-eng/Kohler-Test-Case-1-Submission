import { describe, expect, it } from "vitest";

import { canonicalJson } from "../contracts/canonical.js";
import type { RoomPolygon, Vec2 } from "../contracts/geometry.js";
import { normalizeRoomPolygon, polygonSignedAreaMm2 } from "./polygon.js";

const v = (x: number, y: number): Vec2 => ({ x, y });
const room = (vertices: Vec2[], wallThicknessMm = 100, ccw = true): RoomPolygon => ({
  vertices,
  ccw,
  wallThicknessMm,
});

// Canonical CCW forms (positive shoelace area, start at lexicographically smallest).
const RECT: Vec2[] = [v(0, 0), v(1500, 0), v(1500, 1800), v(0, 1800)];
const LSHAPE: Vec2[] = [
  v(0, 0),
  v(3000, 0),
  v(3000, 1200),
  v(1200, 1200),
  v(1200, 2400),
  v(0, 2400),
];

const rotations = (verts: Vec2[]): Vec2[][] =>
  verts.map((_, k) => verts.slice(k).concat(verts.slice(0, k)));

describe("polygonSignedAreaMm2", () => {
  it("is positive for CCW and negative for CW under the project convention", () => {
    expect(polygonSignedAreaMm2(RECT)).toBe(2_700_000);
    expect(polygonSignedAreaMm2(RECT.slice().reverse())).toBe(-2_700_000);
    expect(polygonSignedAreaMm2(LSHAPE)).toBe(5_040_000);
  });
});

describe("normalizeRoomPolygon — acceptance", () => {
  it("accepts a rectangle and returns the identical canonical polygon", () => {
    const result = normalizeRoomPolygon(room(RECT));
    expect(result).toEqual({
      ok: true,
      polygon: { vertices: RECT, ccw: true, wallThicknessMm: 100 },
    });
  });

  it("accepts an L-shape and returns the identical canonical polygon", () => {
    const result = normalizeRoomPolygon(room(LSHAPE));
    expect(result).toEqual({
      ok: true,
      polygon: { vertices: LSHAPE, ccw: true, wallThicknessMm: 100 },
    });
  });

  it("is idempotent: normalizing the output again changes nothing", () => {
    for (const shape of [RECT, LSHAPE]) {
      const first = normalizeRoomPolygon(room(shape));
      expect(first.ok).toBe(true);
      if (first.ok) {
        const second = normalizeRoomPolygon(first.polygon);
        expect(canonicalJson(second)).toBe(canonicalJson(first));
      }
    }
  });

  it("removes a wraparound duplicate of the first vertex", () => {
    const withDup = RECT.concat([v(0, 0)]);
    const result = normalizeRoomPolygon(room(withDup));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(canonicalJson(result.polygon)).toBe(
        canonicalJson({ vertices: RECT, ccw: true, wallThicknessMm: 100 }),
      );
    }
  });

  it("removes consecutive duplicate vertices", () => {
    const withDup = [v(0, 0), v(0, 0), v(1500, 0), v(1500, 1800), v(0, 1800)];
    const result = normalizeRoomPolygon(room(withDup));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(canonicalJson(result.polygon)).toBe(
        canonicalJson({ vertices: RECT, ccw: true, wallThicknessMm: 100 }),
      );
    }
  });
});

describe("normalizeRoomPolygon — canonical normalization", () => {
  it("maps every rotated start x reversed direction of the rectangle to one polygon", () => {
    const ccwPerms = rotations(RECT);
    const cwPerms = rotations(RECT.slice().reverse());
    const reference = canonicalJson({ vertices: RECT, ccw: true, wallThicknessMm: 100 });
    for (const [index, perm] of [...ccwPerms, ...cwPerms].entries()) {
      const result = normalizeRoomPolygon(room(perm, 100, index < ccwPerms.length));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(canonicalJson(result.polygon)).toBe(reference);
      }
    }
  });

  it("maps every rotated start x reversed direction of the L-shape to one polygon", () => {
    const ccwPerms = rotations(LSHAPE);
    const cwPerms = rotations(LSHAPE.slice().reverse());
    const reference = canonicalJson({ vertices: LSHAPE, ccw: true, wallThicknessMm: 100 });
    for (const [index, perm] of [...ccwPerms, ...cwPerms].entries()) {
      const result = normalizeRoomPolygon(room(perm, 100, index < ccwPerms.length));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(canonicalJson(result.polygon)).toBe(reference);
      }
    }
  });
});

describe("normalizeRoomPolygon — rejection matrix", () => {
  const reject = (input: RoomPolygon): string[] => {
    const result = normalizeRoomPolygon(input);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    return result.reasons;
  };

  it("rejects 3 vertices", () => {
    expect(reject(room([v(0, 0), v(1500, 0), v(0, 1800)]))).toContain("vertex-count");
  });

  it("rejects 5 vertices", () => {
    const five = [v(0, 0), v(2000, 0), v(2000, 1000), v(1000, 1000), v(0, 2000)];
    expect(reject(room(five))).toContain("vertex-count");
  });

  it("rejects 7 vertices", () => {
    const seven = [
      v(0, 0),
      v(1500, 0),
      v(1500, 1800),
      v(1200, 1800),
      v(900, 900),
      v(600, 1800),
      v(0, 1800),
    ];
    expect(reject(room(seven))).toContain("vertex-count");
  });

  it("rejects consecutive duplicates that collapse the count below 4", () => {
    const collapsed = [v(0, 0), v(0, 0), v(1500, 0), v(0, 1800)];
    expect(reject(room(collapsed))).toContain("vertex-count");
  });

  it("rejects a diagonal edge", () => {
    const diagonal = [v(0, 0), v(1000, 0), v(1000, 1000), v(500, 1500)];
    expect(reject(room(diagonal))).toEqual(["non-axis-aligned-edge"]);
  });

  it("rejects collinear consecutive edges (and nothing else)", () => {
    const withCollinear = [
      v(0, 0),
      v(1000, 0),
      v(2000, 0),
      v(2000, 1000),
      v(1000, 1000),
      v(0, 1000),
    ];
    expect(reject(room(withCollinear))).toEqual(["collinear-edges"]);
  });

  it("rejects a zero-area outline (all points collinear)", () => {
    const line = [v(0, 0), v(1000, 0), v(2000, 0), v(3000, 0)];
    const reasons = reject(room(line));
    expect(reasons).toContain("zero-area");
    // reason list order is deterministic: step f before step g
    expect(reasons.indexOf("collinear-edges")).toBeLessThan(reasons.indexOf("zero-area"));
  });

  it("rejects a self-intersecting orthogonal hexagon (bowtie)", () => {
    const bowtie = [
      v(100, 100),
      v(400, 100),
      v(400, 200),
      v(150, 200),
      v(150, 0),
      v(100, 0),
    ];
    expect(reject(room(bowtie))).toEqual(["self-intersecting"]);
  });

  it("rejects non-finite vertex coordinates", () => {
    expect(
      reject(room([v(0, 0), v(Number.NaN, 0), v(1500, 1800), v(0, 1800)])),
    ).toEqual(["non-finite-vertex"]);
    expect(
      reject(room([v(0, 0), v(1500, Number.NEGATIVE_INFINITY), v(1500, 1800), v(0, 1800)])),
    ).toEqual(["non-finite-vertex"]);
  });

  it("rejects zero, negative and non-finite wall thickness", () => {
    expect(reject(room(RECT, 0))).toEqual(["invalid-wall-thickness"]);
    expect(reject(room(RECT, -50))).toEqual(["invalid-wall-thickness"]);
    expect(reject(room(RECT, Number.NaN))).toEqual(["invalid-wall-thickness"]);
  });

  it("collects multiple reasons in the fixed check order (a before b)", () => {
    const bad = room([v(0, 0), v(Number.NaN, 0), v(1500, 1800), v(0, 1800)], -1);
    expect(reject(bad)).toEqual(["invalid-wall-thickness", "non-finite-vertex"]);
  });
});

describe("normalizeRoomPolygon — precision", () => {
  it("normalizes 2+ decimal-place input to canonical 1 dp", () => {
    const input = room(
      [v(0.06, 0.04), v(1500.04, 0.04), v(1500.04, 1800.06), v(0.06, 1800.06)],
      100.26,
    );
    const result = normalizeRoomPolygon(input);
    expect(result).toEqual({
      ok: true,
      polygon: {
        vertices: [v(0.1, 0), v(1500, 0), v(1500, 1800.1), v(0.1, 1800.1)],
        ccw: true,
        wallThicknessMm: 100.3,
      },
    });
  });
});

