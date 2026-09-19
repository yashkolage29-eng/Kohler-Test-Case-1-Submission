// T-025a décor placer tests: strict parse, deterministic placement that never
// collides with fixtures / opening keep-clear zones, wall items facing inward.

import { describe, expect, it } from "vitest";

import {
  LIGHT_DECOR_TYPES,
  MAX_DECOR_ITEMS,
  MAX_DECOR_LIGHTS,
  offlineDecorProposal,
  parseDecorProposal,
  styleDecorProposal,
  placeDecor,
  type DecorProposal,
  type PlacedDecor,
} from "./decor.js";
import { STYLE_PRESETS, detectStylePreset } from "./styles.js";
import type { RenderGeometry, PlacedFixtureRender } from "./contracts/render.js";
import type { AABB, Opening, Vec2 } from "./contracts/geometry.js";
import type { FixtureClass } from "./contracts/vocab.js";
import { aabbForPlacement, aabbInsidePolygonMm, aabbIntersectsMm } from "./geometry/aabb.js";
import { buildWallStrips, stripInwardNormal } from "./geometry/strips.js";

const v = (x: number, y: number): Vec2 => ({ x, y });
const T = 100;

function fixture(polygon: Vec2[], cls: FixtureClass, wall: string, pos: number, w: number, d: number): PlacedFixtureRender {
  const strip = buildWallStrips({ vertices: polygon, ccw: true, wallThicknessMm: T }).find((s) => s.id === wall)!;
  const r = aabbForPlacement(strip, pos, { w, d }, 0);
  if (!r.ok) throw new Error("bad fixture");
  return { modelId: `${cls}-${wall}-${pos}`, fixtureClass: cls, wallStripId: wall, aabb: r.aabb, orientationDeg: 0 };
}

function geom(vertices: Vec2[], fixtures: PlacedFixtureRender[], openings: Opening[]): RenderGeometry {
  return { polygon: { vertices, ccw: true, wallThicknessMm: T }, openings, fixtures, annotations: [] };
}

const RECT = [v(0, 0), v(2400, 0), v(2400, 1800), v(0, 1800)];
const DOOR: Opening = { id: "door-1", wallId: "wall-bottom", kind: "door", alongOffsetMm: 1500, spanMm: 600, swing: { side: "in", leafDimsMm: { w: 600, d: 25 } } };
const RECT_GEOM = geom(
  RECT,
  [
    fixture(RECT, "shower", "wall-left", 0, 900, 900),
    fixture(RECT, "toilet", "wall-top", 1000, 400, 700),
    fixture(RECT, "vanity", "wall-top", 1500, 800, 500),
  ],
  [DOOR, { id: "win-1", wallId: "wall-right", kind: "window", alongOffsetMm: 600, spanMm: 600 }],
);

const L = [v(0, 0), v(3000, 0), v(3000, 1500), v(1500, 1500), v(1500, 2500), v(0, 2500)];
const L_GEOM = geom(
  L,
  [
    fixture(L, "tub", "wall-top", 0, 1700, 750),
    fixture(L, "basin", "wall-right", 0, 600, 450),
    fixture(L, "toilet", "wall-left", 1200, 400, 700),
  ],
  [{ id: "door-1", wallId: "wall-bottom", kind: "door", alongOffsetMm: 300, spanMm: 800, swing: { side: "in", leafDimsMm: { w: 800, d: 25 } } }],
);

const FULL: DecorProposal = {
  style: { palette: ["#aa8866", "#336655"], metal: "brass", lightTemp: "warm" },
  items: [
    { type: "backlit-mirror", anchor: "above-vanity", size: "m" },
    { type: "sconce", anchor: "above-vanity", size: "m" },
    { type: "pendant", anchor: "above-vanity", size: "m" },
    { type: "plant", anchor: "corner", size: "l" },
    { type: "rug", anchor: "above-vanity", size: "s" },
    { type: "towel", anchor: "beside-shower", size: "m" },
    { type: "small-plant", anchor: "on-vanity", size: "m" },
    { type: "candles", anchor: "on-vanity", size: "m" },
    { type: "art", anchor: "free-wall", size: "m" },
    { type: "shelf", anchor: "beside-toilet", size: "m" },
    { type: "stool", anchor: "door-side", size: "m" },
    { type: "vase", anchor: "corner", size: "s" },
    { type: "plant", anchor: "center-floor", size: "s" },
    { type: "art", anchor: "free-wall", size: "l" },
  ],
};

// --- helpers mirroring the placer's contract --------------------------------

function footprint(p: PlacedDecor): AABB {
  const swap = Math.abs(Math.sin(p.rotationY)) > 0.5;
  const w = swap ? p.sizeMm.d : p.sizeMm.w;
  const d = swap ? p.sizeMm.w : p.sizeMm.d;
  const { x, z } = p.positionMm;
  return { min: { x: x - w / 2, y: z - d / 2 }, max: { x: x + w / 2, y: z + d / 2 } };
}
function openingZones(g: RenderGeometry): AABB[] {
  const strips = buildWallStrips(g.polygon);
  return g.openings.map((o) => {
    const s = strips.find((st) => st.id === o.wallId)!;
    const n = stripInwardNormal(s.wallSide);
    const depth = o.kind === "door" ? Math.max(600, o.swing?.side === "in" ? o.spanMm : 0) : 100;
    const a = { x: s.origin.x + s.direction.x * o.alongOffsetMm, y: s.origin.y + s.direction.y * o.alongOffsetMm };
    const b = { x: a.x + s.direction.x * o.spanMm, y: a.y + s.direction.y * o.spanMm };
    const pts = [a, b, { x: a.x + n.x * depth, y: a.y + n.y * depth }, { x: b.x + n.x * depth, y: b.y + n.y * depth }];
    return { min: { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) }, max: { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)) } };
  });
}
function frontClearances(g: RenderGeometry): AABB[] {
  const strips = buildWallStrips(g.polygon);
  return g.fixtures.map((f) => {
    const n = stripInwardNormal(strips.find((s) => s.id === f.wallStripId)!.wallSide);
    const b = f.aabb;
    if (n.y === 1) return { min: { x: b.min.x, y: b.max.y }, max: { x: b.max.x, y: b.max.y + 600 } };
    if (n.y === -1) return { min: { x: b.min.x, y: b.min.y - 600 }, max: { x: b.max.x, y: b.min.y } };
    if (n.x === 1) return { min: { x: b.max.x, y: b.min.y }, max: { x: b.max.x + 600, y: b.max.y } };
    return { min: { x: b.min.x - 600, y: b.min.y }, max: { x: b.min.x, y: b.max.y } };
  });
}

function checkInvariants(g: RenderGeometry, placed: PlacedDecor[]): void {
  const strips = buildWallStrips(g.polygon);
  const zones = openingZones(g);
  const clear = frontClearances(g);
  for (const p of placed) {
    const fp = footprint(p);
    expect(aabbInsidePolygonMm(fp, g.polygon), p.id).toBe(true);
    if (p.mount === "floor") {
      for (const f of g.fixtures) expect(aabbIntersectsMm(fp, f.aabb), `${p.id} vs ${f.modelId}`).toBe(false);
      for (const z of zones) expect(aabbIntersectsMm(fp, z), `${p.id} in opening zone`).toBe(false);
      if (p.type !== "rug") for (const c of clear) expect(aabbIntersectsMm(fp, c), `${p.id} in clearance`).toBe(false);
      expect(p.positionMm.y).toBeCloseTo(p.sizeMm.h / 2, 1); // positions are rounded to 0.1 mm
    }
    if (p.mount === "wall") {
      const n = { x: Math.round(Math.sin(p.rotationY)), y: Math.round(Math.cos(p.rotationY)) };
      const wall = strips.find((s) => {
        const sn = stripInwardNormal(s.wallSide);
        if (sn.x !== n.x || sn.y !== n.y) return false;
        const back = s.direction.x !== 0 ? (n.y === 1 ? fp.min.y : fp.max.y) : n.x === 1 ? fp.min.x : fp.max.x;
        const line = s.direction.x !== 0 ? s.origin.y : s.origin.x;
        return Math.abs(Math.abs(back - line) - T / 2) < 0.2;
      });
      expect(wall, `${p.id} not on an inset wall`).toBeDefined();
      for (const f of g.fixtures.filter((fx) => fx.fixtureClass === "shower")) expect(aabbIntersectsMm(fp, f.aabb), `${p.id} on shower wall`).toBe(false);
      expect(p.positionMm.y + p.sizeMm.h / 2).toBeLessThanOrEqual(2400);
    }
    if (p.mount === "ceiling") {
      for (const f of g.fixtures.filter((fx) => fx.fixtureClass === "shower")) expect(aabbIntersectsMm(fp, f.aabb)).toBe(false);
    }
    if (p.light) expect(LIGHT_DECOR_TYPES).toContain(p.type);
  }
  expect(placed.filter((p) => p.light).length).toBeLessThanOrEqual(MAX_DECOR_LIGHTS);
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [a, b] = [placed[i], placed[j]];
      if (a.mount !== b.mount) continue;
      const planHit = aabbIntersectsMm(footprint(a), footprint(b));
      const vHit = a.positionMm.y - a.sizeMm.h / 2 < b.positionMm.y + b.sizeMm.h / 2 && b.positionMm.y - b.sizeMm.h / 2 < a.positionMm.y + a.sizeMm.h / 2;
      expect(planHit && (a.mount !== "wall" || vHit), `${a.id} collides with ${b.id}`).toBe(false);
    }
  }
}

describe("parseDecorProposal", () => {
  const ok = { style: { palette: ["#112233"], metal: "chrome", lightTemp: "cool" }, items: [{ type: "plant", anchor: "corner", size: "m" }] };

  it("accepts a valid proposal and deep-copies it", () => {
    const parsed = parseDecorProposal(ok);
    expect(parsed).toEqual(ok);
    parsed!.style.palette.push("#000000");
    expect(ok.style.palette).toHaveLength(1);
  });

  it("rejects malformed input", () => {
    const bad: unknown[] = [
      null,
      "x",
      [],
      { ...ok, extra: 1 },
      { style: ok.style },
      { ...ok, style: { ...ok.style, extra: 1 } },
      { ...ok, style: { ...ok.style, palette: [] } },
      { ...ok, style: { ...ok.style, palette: ["#12345"] } },
      { ...ok, style: { ...ok.style, palette: ["#111111", "#222222", "#333333", "#444444", "#555555"] } },
      { ...ok, style: { ...ok.style, metal: "gold" } },
      { ...ok, style: { ...ok.style, lightTemp: "hot" } },
      { ...ok, items: [] },
      { ...ok, items: [{ type: "sofa", anchor: "corner", size: "m" }] },
      { ...ok, items: [{ type: "plant", anchor: "roof", size: "m" }] },
      { ...ok, items: [{ type: "plant", anchor: "corner", size: "xl" }] },
      { ...ok, items: [{ type: "plant", anchor: "corner", size: "m", color: "red" }] },
      { ...ok, items: [{ type: "plant", anchor: "corner", size: "m", xMm: 5 }] },
      { ...ok, items: [ok.items[0], "plant"] },
      { ...ok, items: Array.from({ length: 51 }, () => ok.items[0]) },
    ];
    for (const raw of bad) expect(parseDecorProposal(raw), JSON.stringify(raw)).toBeNull();
  });

  it("caps items and lights, keeping the first", () => {
    const items = [
      ...Array.from({ length: 5 }, () => ({ type: "sconce", anchor: "free-wall", size: "s" })),
      ...Array.from({ length: 20 }, () => ({ type: "plant", anchor: "corner", size: "s" })),
    ];
    const parsed = parseDecorProposal({ ...ok, items })!;
    expect(parsed.items).toHaveLength(MAX_DECOR_ITEMS);
    expect(parsed.items.filter((i) => i.type === "sconce")).toHaveLength(MAX_DECOR_LIGHTS);
    expect(parsed.items[0].type).toBe("sconce");
  });
});

describe("placeDecor", () => {
  it("places a full set in a rectangular room without collisions", () => {
    const placed = placeDecor(FULL, RECT_GEOM);
    expect(placed.length).toBeGreaterThanOrEqual(10);
    checkInvariants(RECT_GEOM, placed);
    expect(new Set(placed.map((p) => p.id)).size).toBe(placed.length);
    for (const p of placed) expect(p.id).toMatch(/^decor-\d+-[a-z-]+$/);
  });

  it("anchors mirror over the vanity, surface items on it, lights warm", () => {
    const placed = placeDecor(FULL, RECT_GEOM);
    const vanity = RECT_GEOM.fixtures.find((f) => f.fixtureClass === "vanity")!.aabb;
    const mirror = placed.find((p) => p.type === "backlit-mirror")!;
    expect(mirror.mount).toBe("wall");
    expect(mirror.positionMm.x).toBeCloseTo((vanity.min.x + vanity.max.x) / 2);
    expect(mirror.positionMm.y - mirror.sizeMm.h / 2).toBeGreaterThanOrEqual(900);
    expect(mirror.rotationY).toBeCloseTo(0); // top wall faces +z (room +y)
    expect(mirror.light).toEqual({ color: "#ffcf9a", intensity: 1 });
    const sconce = placed.find((p) => p.type === "sconce")!;
    expect(sconce.positionMm.y).toBe(1700);
    expect(Math.abs(sconce.positionMm.x - mirror.positionMm.x)).toBeLessThan(700);
    for (const s of placed.filter((p) => p.mount === "surface")) {
      expect(s.positionMm.y).toBeCloseTo(900 + s.sizeMm.h / 2);
      const fp = footprint(s);
      expect(fp.min.x >= vanity.min.x && fp.max.x <= vanity.max.x && fp.max.y <= vanity.max.y).toBe(true);
    }
    const rug = placed.find((p) => p.type === "rug")!;
    expect(rug.positionMm.z).toBeGreaterThan(vanity.max.y);
    const pendant = placed.find((p) => p.type === "pendant")!;
    expect(pendant.mount).toBe("ceiling");
    expect(pendant.positionMm.y + pendant.sizeMm.h / 2).toBeLessThan(2400);
  });

  it("uses glass for mirrors and palette/explicit colours otherwise", () => {
    const placed = placeDecor(
      { style: { palette: ["#123456"], metal: "black", lightTemp: "cool" }, items: [{ type: "mirror", anchor: "above-vanity", size: "m" }, { type: "plant", anchor: "corner", size: "m", color: "#abcdef" }, { type: "art", anchor: "free-wall", size: "m" }] },
      RECT_GEOM,
    );
    expect(placed[0].color).not.toBe("#123456");
    expect(placed[1].color).toBe("#abcdef");
    expect(placed[2].color).toBe("#123456");
    expect(placed.every((p) => p.metal === "black")).toBe(true);
  });

  it("works in an L-shaped room, facing each wall inward", () => {
    const items = [...FULL.items, { type: "art" as const, anchor: "free-wall" as const, size: "s" as const }].slice(0, MAX_DECOR_ITEMS);
    const placed = placeDecor({ ...FULL, items }, L_GEOM);
    expect(placed.length).toBeGreaterThanOrEqual(8);
    checkInvariants(L_GEOM, placed);
  });

  it("wall rotation follows the inward normal on every side", () => {
    const g = geom(RECT, [], []);
    const art = Array.from({ length: 10 }, () => ({ type: "art" as const, anchor: "free-wall" as const, size: "l" as const }));
    const placed = placeDecor({ ...FULL, items: art }, g);
    checkInvariants(g, placed);
    const rotations = new Set(placed.map((p) => Math.round(p.rotationY * 100)));
    expect(rotations.size).toBeGreaterThanOrEqual(2);
  });

  it("skips items in a tiny room without crashing", () => {
    const tiny = [v(0, 0), v(600, 0), v(600, 600), v(0, 600)];
    const g = geom(tiny, [], [{ id: "d", wallId: "wall-bottom", kind: "door", alongOffsetMm: 0, spanMm: 600, swing: { side: "in", leafDimsMm: { w: 600, d: 25 } } }]);
    const placed = placeDecor(FULL, g);
    expect(placed.length).toBeLessThan(FULL.items.length);
    checkInvariants(g, placed);
  });

  it("is deterministic and independent of fixture order", () => {
    const a = placeDecor(FULL, RECT_GEOM);
    expect(placeDecor(FULL, RECT_GEOM)).toEqual(a);
    expect(placeDecor(FULL, { ...RECT_GEOM, fixtures: [...RECT_GEOM.fixtures].reverse() })).toEqual(a);
    const b = placeDecor(FULL, L_GEOM);
    expect(placeDecor(FULL, { ...L_GEOM, fixtures: [...L_GEOM.fixtures].reverse() })).toEqual(b);
  });

  it("never emits more than MAX_DECOR_LIGHTS lights", () => {
    const items = Array.from({ length: 6 }, () => ({ type: "pendant" as const, anchor: "ceiling-center" as const, size: "s" as const }));
    const placed = placeDecor({ ...FULL, items }, RECT_GEOM);
    expect(placed.length).toBe(MAX_DECOR_LIGHTS);
  });
});

describe("offlineDecorProposal", () => {
  const tastes = ["", "warm spa plants", "cool minimal", "Luxury GOLD glam", "black industrial loft", "coastal fresh blue", "biophilic natural green zen", "cozy wood earthy rustic spa luxury plants black"];

  it("always parses, stays within caps and places cleanly", () => {
    for (const t of tastes) {
      const p = offlineDecorProposal(t);
      expect(parseDecorProposal(p), t).toEqual(p);
      expect(p.items.length).toBeLessThanOrEqual(MAX_DECOR_ITEMS);
      expect(p.items.filter((i) => LIGHT_DECOR_TYPES.includes(i.type)).length).toBeLessThanOrEqual(MAX_DECOR_LIGHTS);
      checkInvariants(RECT_GEOM, placeDecor(p, RECT_GEOM));
    }
  });

  it("maps keywords deterministically", () => {
    const warm = offlineDecorProposal("warm spa plants");
    const cool = offlineDecorProposal("cool minimal");
    expect(warm).not.toEqual(cool);
    expect(warm.style.lightTemp).toBe("warm");
    expect(cool.style.lightTemp).toBe("cool");
    expect(cool.items.length).toBe(5);
    expect(warm.items.some((i) => i.type === "candles")).toBe(true);
    expect(warm.items.filter((i) => i.type === "plant").length).toBeGreaterThan(cool.items.filter((i) => i.type === "plant").length);
    expect(offlineDecorProposal("GOLD glam").style.metal).toBe("brass");
    expect(offlineDecorProposal("industrial").style.metal).toBe("black");
    expect(offlineDecorProposal("Warm Spa Plants")).toEqual(warm);
  });
});

describe("style presets", () => {
  it("every preset parses, stays within caps and places cleanly in both rooms", () => {
    for (const key of STYLE_PRESETS) {
      const p = styleDecorProposal(key);
      expect(p.style.preset).toBe(key);
      expect(parseDecorProposal(p), key).toEqual(p);
      expect(p.items.filter((i) => LIGHT_DECOR_TYPES.includes(i.type)).length, key).toBeLessThanOrEqual(MAX_DECOR_LIGHTS);
      for (const g of [RECT_GEOM, L_GEOM]) {
        const placed = placeDecor(p, g);
        checkInvariants(g, placed);
        expect(placed.length, key).toBeGreaterThanOrEqual(4);
        expect(placeDecor(styleDecorProposal(key), g)).toEqual(placed);
      }
    }
  });

  it("presets are distinct", () => {
    const sigs = STYLE_PRESETS.map((k) => JSON.stringify(styleDecorProposal(k)));
    expect(new Set(sigs).size).toBe(STYLE_PRESETS.length);
  });

  it("an explicit preset wins over taste keywords offline", () => {
    expect(offlineDecorProposal("warm spa plants", "coastal")).toEqual(styleDecorProposal("coastal"));
  });

  it("detects presets from taste words, preferring explicit style names", () => {
    expect(detectStylePreset("Japanese brutalism with raw concrete")).toBe("japanese-brutalism");
    expect(detectStylePreset("a calm japanese bathroom")).toBe("japanese-zen");
    expect(detectStylePreset("japandi, warm oak")).toBe("japandi");
    expect(detectStylePreset("Classic luxury with gold")).toBe("classic-luxury");
    expect(detectStylePreset("minimalist modern")).toBe("minimalist-modern");
    expect(detectStylePreset("nordic hygge")).toBe("scandinavian");
    expect(detectStylePreset("industrial loft, exposed brick")).toBe("industrial-loft");
    expect(detectStylePreset("beach house")).toBe("coastal");
    expect(detectStylePreset("just a bathroom")).toBeUndefined();
    expect(offlineDecorProposal("black industrial loft").style.preset).toBe("industrial-loft");
    expect(offlineDecorProposal("").style.preset).toBeUndefined();
  });

  it("parse rejects an unknown preset and extra style keys", () => {
    const p = styleDecorProposal("japandi");
    expect(parseDecorProposal({ ...p, style: { ...p.style, preset: "baroque" } })).toBeNull();
    expect(parseDecorProposal({ ...p, style: { ...p.style, floor: "oak" } })).toBeNull();
  });
});
