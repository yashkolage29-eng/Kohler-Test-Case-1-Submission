import { describe, expect, it } from "vitest";

import type { Opening, RoomPolygon, Vec2, WallStrip } from "../contracts/geometry.js";
import { buildWallStrips } from "./strips.js";
import { subtractKeepClear, validateOpenings } from "./openings.js";

const v = (x: number, y: number): Vec2 => ({ x, y });
const room = (vertices: Vec2[]): RoomPolygon => ({
  vertices,
  ccw: true,
  wallThicknessMm: 100,
});
const RECT: Vec2[] = [v(0, 0), v(1500, 0), v(1500, 1800), v(0, 1800)];
const strips: WallStrip[] = buildWallStrips(room(RECT));

const door: Opening = {
  id: "door-1",
  wallId: "wall-bottom",
  kind: "door",
  alongOffsetMm: 900,
  spanMm: 600,
  swing: { side: "in", leafDimsMm: { w: 600, d: 25 } },
};
const window1: Opening = {
  id: "window-1",
  wallId: "wall-top",
  kind: "window",
  alongOffsetMm: 0,
  spanMm: 800,
};

describe("validateOpenings — acceptance", () => {
  it("accepts valid door + window and canonically sorts by id", () => {
    const result = validateOpenings([window1, door], strips);
    expect(result).toEqual({ ok: true, openings: [door, window1] });
  });

  it("allows touching openings on the same wall", () => {
    const a: Opening = { ...door, alongOffsetMm: 0 };
    const b: Opening = { ...window1, id: "window-1", wallId: "wall-bottom", alongOffsetMm: 600 };
    expect(validateOpenings([a, b], strips).ok).toBe(true);
  });
});

describe("validateOpenings — rejections", () => {
  const reasonsOf = (openings: Opening[]): string[] | null => {
    const result = validateOpenings(openings, strips);
    return result.ok ? null : result.reasons;
  };

  it("rejects an unknown wall", () => {
    expect(reasonsOf([{ ...door, wallId: "wall-diagonal" }])).toEqual(["unknown-wall"]);
  });

  it("rejects an opening running past the wall end", () => {
    expect(reasonsOf([{ ...door, alongOffsetMm: 1000 }])).toEqual(["opening-outside-wall"]);
  });

  it("rejects zero/negative span and negative offset", () => {
    expect(reasonsOf([{ ...door, spanMm: 0 }])).toEqual(["invalid-span"]);
    expect(reasonsOf([{ ...door, spanMm: -5 }])).toEqual(["invalid-span"]);
    expect(reasonsOf([{ ...door, alongOffsetMm: -1 }])).toEqual(["invalid-offset"]);
  });

  it("rejects non-finite values including swing leaf dims", () => {
    expect(reasonsOf([{ ...door, alongOffsetMm: Number.NaN }])).toEqual(["non-finite-opening"]);
    expect(
      reasonsOf([
        {
          ...door,
          swing: { side: "in", leafDimsMm: { w: Number.POSITIVE_INFINITY, d: 25 } },
        },
      ]),
    ).toEqual(["non-finite-opening"]);
  });

  it("rejects an invalid swing side", () => {
    expect(
      reasonsOf([{ ...door, swing: { side: "up" as never, leafDimsMm: { w: 600, d: 25 } } }]),
    ).toEqual(["invalid-swing"]);
  });

  it("rejects overlapping openings on the same wall (but not on different walls)", () => {
    const overlap: Opening = { ...window1, id: "window-1", wallId: "wall-bottom", alongOffsetMm: 1000, spanMm: 500 };
    expect(reasonsOf([door, overlap])).toEqual(["overlapping-openings"]);
    expect(reasonsOf([door, window1])).toBeNull();
  });
});

describe("subtractKeepClear", () => {
  it("subtracts opening spans from the matching strips only", () => {
    const result = subtractKeepClear(strips, [door, window1]);
    const byId = new Map(result.map((s) => [s.id, s.usableLengthMm]));
    expect(byId.get("wall-bottom")).toBe(900);
    expect(byId.get("wall-top")).toBe(700);
    expect(byId.get("wall-left")).toBe(1800);
    expect(byId.get("wall-right")).toBe(1800);
  });

  it("returns unchanged strips when there are no openings", () => {
    expect(subtractKeepClear(strips, [])).toEqual(strips);
  });
});
