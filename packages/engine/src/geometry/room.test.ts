import { describe, expect, it } from "vitest";

import { canonicalJson, DEFAULT_CONFIG } from "../index.js";
import type { InputSet, Opening, RoomPolygon, Vec2 } from "../contracts/input.js";
import { buildBathroomRep } from "./room.js";

const v = (x: number, y: number): Vec2 => ({ x, y });
const RECT: Vec2[] = [v(0, 0), v(1500, 0), v(1500, 1800), v(0, 1800)];
const LSHAPE: Vec2[] = [
  v(0, 0),
  v(3000, 0),
  v(3000, 1200),
  v(1200, 1200),
  v(1200, 2400),
  v(0, 2400),
];

const polygon = (vertices: Vec2[]): RoomPolygon => ({
  vertices,
  ccw: true,
  wallThicknessMm: 100,
});

const door: Opening = {
  id: "door-1",
  wallId: "wall-bottom",
  kind: "door",
  alongOffsetMm: 900,
  spanMm: 600,
  swing: { side: "in", leafDimsMm: { w: 600, d: 25 } },
};

const input = (overrides: Partial<InputSet>): InputSet => ({
  polygon: polygon(RECT),
  openings: [door],
  confirmed: true,
  featureConstraints: {
    requiredFeatures: [],
    preferredClasses: [],
    finishFamilies: [],
    classCountRanges: {},
  },
  budget: { bMax: 300000, bTarget: 250000 },
  config: DEFAULT_CONFIG,
  ...overrides,
});

describe("buildBathroomRep — Step-01 gate", () => {
  it("builds canonical geometry from confirmed rectangle input", () => {
    const result = buildBathroomRep(input({}));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { rep } = result;
    expect(canonicalJson(rep.polygon)).toBe(
      canonicalJson({ vertices: RECT, ccw: true, wallThicknessMm: 100 }),
    );
    const byId = new Map(rep.strips.map((s) => [s.id, s.usableLengthMm]));
    expect(byId.get("wall-bottom")).toBe(900); // 1500 - 600 door keep-clear
    expect(byId.get("wall-top")).toBe(1500);
    expect(byId.get("wall-left")).toBe(1800);
    expect(rep.openings).toEqual([door]); // canonical id order
    expect(rep.slotGridMm).toBe(25);
    expect(rep.plumbingZones).toEqual([]); // zones are T-006/T-007 scope
    expect(rep.obstacles).toEqual([]);
  });

  it("blocks unconfirmed input (hard Step-01 gate)", () => {
    expect(buildBathroomRep(input({ confirmed: false }))).toEqual({
      ok: false,
      reasons: ["input-not-confirmed"],
    });
  });

  it("passes through malformed polygon reasons", () => {
    const diagonal = [v(0, 0), v(1000, 0), v(1000, 1000), v(500, 1500)];
    expect(buildBathroomRep(input({ polygon: polygon(diagonal) }))).toEqual({
      ok: false,
      reasons: ["non-axis-aligned-edge"],
    });
  });

  it("rejects openings outside the wall", () => {
    expect(
      buildBathroomRep(input({ openings: [{ ...door, alongOffsetMm: 1000 }] })),
    ).toEqual({ ok: false, reasons: ["opening-outside-wall"] });
  });

  it("rejects an invalid slot grid", () => {
    expect(
      buildBathroomRep(input({ config: { ...DEFAULT_CONFIG, slotGridMm: 0 } })),
    ).toEqual({ ok: false, reasons: ["invalid-slot-grid"] });
  });
});

describe("buildBathroomRep — L-shape", () => {
  it("represents all 6 walls and subtracts keep-clear on a notch wall", () => {
    const window1: Opening = {
      id: "window-1",
      wallId: "wall-bottom-2",
      kind: "window",
      alongOffsetMm: 0,
      spanMm: 500,
    };
    const result = buildBathroomRep(input({ polygon: polygon(LSHAPE), openings: [window1] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rep.strips).toHaveLength(6);
    const bottom2 = result.rep.strips.find((s) => s.id === "wall-bottom-2");
    expect(bottom2?.usableLengthMm).toBe(1300);
  });
});

describe("buildBathroomRep — reordered-input determinism", () => {
  it("produces canonicalJson-identical output regardless of opening order", () => {
    const a = buildBathroomRep(input({}));
    const b = buildBathroomRep(input({ openings: [door, door].map((o, i) => ({ ...o, id: `door-${i + 1}`, wallId: "wall-bottom", alongOffsetMm: i === 0 ? 0 : 900, spanMm: 600 })) }));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      // openings differ (two doors vs one) — compare strip geometry instead
      expect(canonicalJson(a.rep.strips)).not.toBe(canonicalJson(b.rep.strips));
    }
    const shuffled = buildBathroomRep(
      input({ openings: [{ ...door, id: "z-door" }, { ...door, id: "a-door", wallId: "wall-bottom", alongOffsetMm: 0 }] }),
    );
    const ordered = buildBathroomRep(
      input({ openings: [{ ...door, id: "a-door", wallId: "wall-bottom", alongOffsetMm: 0 }, { ...door, id: "z-door" }] }),
    );
    expect(shuffled.ok).toBe(true);
    expect(ordered.ok).toBe(true);
    if (shuffled.ok && ordered.ok) {
      expect(canonicalJson(shuffled.rep)).toBe(canonicalJson(ordered.rep));
    }
  });
});
