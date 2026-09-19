import { describe, expect, it } from "vitest";

import { canonicalJson } from "../contracts/canonical.js";
import type { RoomPolygon, Vec2 } from "../contracts/geometry.js";
import { normalizeRoomPolygon } from "./polygon.js";
import {
  buildWallStrips,
  stripInwardNormal,
  stripLengthMm,
  stripPoint,
} from "./strips.js";

const v = (x: number, y: number): Vec2 => ({ x, y });
const room = (vertices: Vec2[], wallThicknessMm = 100): RoomPolygon => ({
  vertices,
  ccw: true,
  wallThicknessMm,
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

describe("buildWallStrips — rectangle", () => {
  it("produces 4 strips matching the contracts/fixtures.ts convention", () => {
    const strips = buildWallStrips(room(RECT));
    expect(strips.map((s) => s.id)).toEqual([
      "wall-bottom",
      "wall-left",
      "wall-right",
      "wall-top",
    ]);
    const bottom = strips[0];
    expect(bottom.wallSide).toBe("bottom");
    expect(bottom.origin).toEqual(v(0, 1800));
    expect(bottom.direction).toEqual(v(1, 0));
    expect(stripLengthMm(bottom)).toBe(1500);
    const left = strips[1];
    expect(left.origin).toEqual(v(0, 0));
    expect(left.direction).toEqual(v(0, 1));
    expect(stripLengthMm(left)).toBe(1800);
  });
});

describe("buildWallStrips — L-shape (adjacent walls)", () => {
  it("produces 6 strips with deterministic duplicate-side suffixes", () => {
    const strips = buildWallStrips(room(LSHAPE));
    expect(strips.map((s) => s.id)).toEqual([
      "wall-bottom",
      "wall-bottom-2",
      "wall-left",
      "wall-right",
      "wall-right-2",
      "wall-top",
    ]);
    // Notch walls: the y=1200 horizontal edge and the x=1200 vertical edge.
    const bottom2 = strips.find((s) => s.id === "wall-bottom-2");
    expect(bottom2).toMatchObject({
      origin: v(1200, 1200),
      direction: v(1, 0),
      usableLengthMm: 1800,
    });
    const right = strips.find((s) => s.id === "wall-right");
    expect(right).toMatchObject({
      origin: v(1200, 1200),
      direction: v(0, 1),
      usableLengthMm: 1200,
    });
    const right2 = strips.find((s) => s.id === "wall-right-2");
    expect(right2).toMatchObject({
      origin: v(3000, 0),
      direction: v(0, 1),
      usableLengthMm: 1200,
    });
    const top = strips.find((s) => s.id === "wall-top");
    expect(top).toMatchObject({ origin: v(0, 0), direction: v(1, 0), usableLengthMm: 3000 });
  });
});

describe("buildWallStrips — determinism", () => {
  it("gives the same strips for CW and CCW vertex input (after normalization)", () => {
    const cw = normalizeRoomPolygon(room(RECT.slice().reverse()));
    expect(cw.ok).toBe(true);
    if (cw.ok) {
      expect(canonicalJson(buildWallStrips(cw.polygon))).toBe(
        canonicalJson(buildWallStrips(room(RECT))),
      );
    }
  });
});

describe("stripInwardNormal", () => {
  it("points into the room for each side (y-down convention)", () => {
    expect(stripInwardNormal("top")).toEqual(v(0, 1));
    expect(stripInwardNormal("bottom")).toEqual(v(0, -1));
    expect(stripInwardNormal("left")).toEqual(v(1, 0));
    expect(stripInwardNormal("right")).toEqual(v(-1, 0));
  });
  it("throws on an unknown side", () => {
    expect(() => stripInwardNormal("diagonal")).toThrow();
  });
});

describe("stripPoint", () => {
  it("projects along the strip direction at canonical precision", () => {
    const bottom = buildWallStrips(room(RECT))[0];
    expect(stripPoint(bottom, 600)).toEqual(v(600, 1800));
    expect(stripPoint(bottom, 0.04)).toEqual(v(0, 1800));
    expect(() => stripPoint(bottom, Number.NaN)).toThrow();
  });
});

