// T-025 AI décor contract. AI proposes items + style (closed enums, no coordinates);
// placeDecor deterministically positions them against engine render geometry.
// Décor is presentation only: never a KOHLER product, never in the BOM.
import type { RenderGeometry } from "./contracts/render.js";
import type { AABB, Vec2, WallStrip } from "./contracts/geometry.js";
import type { FixtureClass } from "./contracts/vocab.js";
import { aabbInsidePolygonMm, aabbIntersectsMm } from "./geometry/aabb.js";
import { buildWallStrips, rangesIntersectMm, stripInwardNormal, stripPoint } from "./geometry/strips.js";
import { roundMm } from "./geometry/num.js";
import { STYLE_PRESETS, STYLES, detectStylePreset, type StylePreset } from "./styles.js";

export const DECOR_TYPES = ["pendant", "sconce", "backlit-mirror", "mirror", "art", "plant", "small-plant", "rug", "towel", "vase", "candles", "shelf", "stool", "chandelier", "lantern", "bench", "basket", "bowl"] as const;
export type DecorType = (typeof DECOR_TYPES)[number];
export const LIGHT_DECOR_TYPES: readonly DecorType[] = ["pendant", "sconce", "backlit-mirror", "chandelier", "lantern"];
export const DECOR_ANCHORS = ["above-vanity", "above-basin", "beside-toilet", "beside-shower", "on-vanity", "corner", "free-wall", "door-side", "center-floor", "ceiling-center"] as const;
export type DecorAnchor = (typeof DECOR_ANCHORS)[number];
export const MAX_DECOR_ITEMS = 14;
export const MAX_DECOR_LIGHTS = 3;

export interface DecorStyle {
  /** 1–4 "#rrggbb" colours. */
  palette: string[];
  metal: "chrome" | "brass" | "black" | "nickel";
  lightTemp: "warm" | "neutral" | "cool";
  /** Optional curated aesthetic (styles.ts): drives room materials in the renderer. */
  preset?: StylePreset;
}
export interface DecorItemProposal {
  type: DecorType;
  anchor: DecorAnchor;
  size: "s" | "m" | "l";
  /** Optional "#rrggbb"; falls back to the style palette. */
  color?: string;
}
export interface DecorProposal {
  style: DecorStyle;
  items: DecorItemProposal[];
}

export interface PlacedDecor {
  /** Stable id: `decor-<index>-<type>`. */
  id: string;
  type: DecorType;
  mount: "floor" | "wall" | "ceiling" | "surface";
  /** Centre of the item's bounding box in 3D world mm: x = room x, y = height, z = room y. */
  positionMm: { x: number; y: number; z: number };
  /** Rotation about world up (radians). Local +z (item front) faces the room interior. */
  rotationY: number;
  /** Bounding box before rotation: w along local x, h vertical, d along local z. */
  sizeMm: { w: number; h: number; d: number };
  color: string;
  metal: DecorStyle["metal"];
  /** Present only for emitting light types (at most MAX_DECOR_LIGHTS per scene). */
  light?: { color: string; intensity: number };
}


// ---------------------------------------------------------------------------
// Parsing (strict; mirrors drafts.ts parse style)

const HEX = /^#[0-9a-fA-F]{6}$/;
const METALS: DecorStyle["metal"][] = ["chrome", "brass", "black", "nickel"];
const LIGHT_TEMPS: DecorStyle["lightTemp"][] = ["warm", "neutral", "cool"];
const SIZES: DecorItemProposal["size"][] = ["s", "m", "l"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, required: string[]): boolean {
  const k = Object.keys(value);
  return k.length === required.length && required.every((key) => k.includes(key));
}
function isMember<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}
function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}
function isLight(type: DecorType): boolean {
  return LIGHT_DECOR_TYPES.includes(type);
}

/** Strict parse of untrusted AI output. Malformed structure → null. Light items beyond
 *  MAX_DECOR_LIGHTS are dropped, then the first MAX_DECOR_ITEMS survivors are kept. */
export function parseDecorProposal(raw: unknown): DecorProposal | null {
  if (!isObject(raw) || !exactKeys(raw, ["style", "items"])) return null;
  const { style, items } = raw;
  if (!isObject(style) || !(exactKeys(style, ["palette", "metal", "lightTemp"]) || exactKeys(style, ["palette", "metal", "lightTemp", "preset"]))) return null;
  if ("preset" in style && !isMember(style.preset, STYLE_PRESETS)) return null;
  if (!Array.isArray(style.palette) || style.palette.length < 1 || style.palette.length > 4 || !style.palette.every(isHex)) return null;
  if (!isMember(style.metal, METALS) || !isMember(style.lightTemp, LIGHT_TEMPS)) return null;
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) return null;
  for (const item of items) {
    if (!isObject(item) || !Object.keys(item).every((k) => ["type", "anchor", "size", "color"].includes(k))) return null;
    if (!isMember(item.type, DECOR_TYPES) || !isMember(item.anchor, DECOR_ANCHORS) || !isMember(item.size, SIZES)) return null;
    if ("color" in item && !isHex(item.color)) return null;
  }
  const kept: DecorItemProposal[] = [];
  let lights = 0;
  for (const item of items as DecorItemProposal[]) {
    if (kept.length >= MAX_DECOR_ITEMS) break;
    if (isLight(item.type)) {
      if (lights >= MAX_DECOR_LIGHTS) continue;
      lights++;
    }
    kept.push({ type: item.type, anchor: item.anchor, size: item.size, ...(item.color === undefined ? {} : { color: item.color }) });
  }
  return {
    style: { palette: [...(style.palette as string[])], metal: style.metal, lightTemp: style.lightTemp, ...(style.preset === undefined ? {} : { preset: style.preset as StylePreset }) },
    items: kept,
  };
}

// ---------------------------------------------------------------------------
// Placement

type Mount = PlacedDecor["mount"];
interface Dims { w: number; h: number; d: number }

/** Medium-size dimensions (mm); s/m/l scale w/h/d uniformly (rug keeps its 10 mm height). */
const BASE_DIMS: Record<DecorType, Dims> = {
  pendant: { w: 300, h: 350, d: 300 },
  sconce: { w: 120, h: 300, d: 120 },
  "backlit-mirror": { w: 700, h: 900, d: 40 },
  mirror: { w: 600, h: 800, d: 30 },
  art: { w: 500, h: 600, d: 30 },
  plant: { w: 400, h: 900, d: 400 },
  "small-plant": { w: 150, h: 250, d: 150 },
  rug: { w: 1000, h: 10, d: 600 },
  towel: { w: 500, h: 600, d: 80 },
  vase: { w: 120, h: 280, d: 120 },
  candles: { w: 200, h: 150, d: 120 },
  shelf: { w: 600, h: 40, d: 200 },
  stool: { w: 400, h: 450, d: 400 },
  chandelier: { w: 650, h: 700, d: 650 },
  lantern: { w: 250, h: 450, d: 250 },
  bench: { w: 900, h: 450, d: 350 },
  basket: { w: 400, h: 350, d: 300 },
  bowl: { w: 250, h: 90, d: 250 },
};
const SIZE_SCALE: Record<DecorItemProposal["size"], number> = { s: 0.75, m: 1, l: 1.25 };

const MOUNT_BY_TYPE: Record<DecorType, Mount> = {
  pendant: "ceiling",
  sconce: "wall",
  "backlit-mirror": "wall",
  mirror: "wall",
  art: "wall",
  shelf: "wall",
  towel: "wall",
  plant: "floor",
  rug: "floor",
  stool: "floor",
  "small-plant": "surface",
  vase: "surface",
  candles: "surface",
  chandelier: "ceiling",
  lantern: "floor",
  bench: "floor",
  basket: "floor",
  bowl: "surface",
};
/** Default mount-centre heights (mm) for wall items. */
const WALL_CENTRE_Y: Partial<Record<DecorType, number>> = {
  mirror: 1500,
  "backlit-mirror": 1500,
  art: 1500,
  sconce: 1700,
  shelf: 1300,
  towel: 1000,
};
/** Assumed fixture top heights (mm); RenderGeometry carries plan AABBs only. */
const FIXTURE_HEIGHT: Record<FixtureClass, number> = {
  toilet: 800,
  basin: 900,
  vanity: 900,
  tub: 600,
  shower: 2100,
  faucet: 1100,
  accessory: 1200,
};
const CLEARANCE_CLASSES: FixtureClass[] = ["toilet", "basin", "vanity", "tub", "shower"];
const FRONT_CLEARANCE_MM = 600;
const WALL_HEIGHT_MM = 2400; // matches web/render3d/sceneSpec.ts
const PENDANT_DROP_MM = 500;
const GAP_MM = 50;
const GRID_STEP_MM = 150;
const WINDOW_BAND_MM: [number, number] = [900, 2100];
const DOOR_HEIGHT_MM = 2100;
const GLASS_HEX = "#c9d6dc";
const LIGHT_HEX: Record<DecorStyle["lightTemp"], string> = { warm: "#ffcf9a", neutral: "#fff4e5", cool: "#e6f0ff" };
const LIGHT_INTENSITY: Partial<Record<DecorType, number>> = { pendant: 1.2, sconce: 0.8, "backlit-mirror": 1, chandelier: 1.4, lantern: 0.6 };

interface Fx { cls: FixtureClass; aabb: AABB; strip?: WallStrip; height: number }
interface WallPlaced { type: DecorType; stripId: string; c: number; w: number; plan: AABB; y0: number; y1: number }
interface Ctx {
  polygon: RenderGeometry["polygon"];
  strips: WallStrip[];
  openings: RenderGeometry["openings"];
  doors: { strip: WallStrip; a0: number; a1: number }[];
  halfT: number;
  fixtures: Fx[];
  openingZones: AABB[];
  doorZones: AABB[];
  clearances: AABB[];
  floor: AABB[];
  ceiling: AABB[];
  surface: AABB[];
  wall: WallPlaced[];
}
interface Spot { plan: AABB; rot: number; y: number; wall?: { stripId: string; c: number } }

function box(x0: number, y0: number, x1: number, y1: number): AABB {
  return { min: { x: Math.min(x0, x1), y: Math.min(y0, y1) }, max: { x: Math.max(x0, x1), y: Math.max(y0, y1) } };
}
function expand(b: AABB, m: number): AABB {
  return box(b.min.x - m, b.min.y - m, b.max.x + m, b.max.y + m);
}
function centre(b: AABB): Vec2 {
  return { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 };
}
function contains(outer: AABB, inner: AABB): boolean {
  return inner.min.x >= outer.min.x && inner.min.y >= outer.min.y && inner.max.x <= outer.max.x && inner.max.y <= outer.max.y;
}
/** Rotation so local +z faces the inward normal (three.js: R_y(θ)·(0,0,1) = (sin θ, 0, cos θ)). */
function inwardRotation(strip: WallStrip): number {
  const n = stripInwardNormal(strip.wallSide);
  return Math.atan2(n.x, n.y);
}
/** Coordinate of `p` along the strip axis. */
function alongOf(strip: WallStrip, p: Vec2): number {
  return strip.direction.x !== 0 ? (p.x - strip.origin.x) * strip.direction.x : (p.y - strip.origin.y) * strip.direction.y;
}
/** Plan box spanning [c - w/2, c + w/2] along the strip and [off, off + d] inward. */
function wallBox(strip: WallStrip, c: number, w: number, off: number, d: number): AABB {
  const n = stripInwardNormal(strip.wallSide);
  const a = stripPoint(strip, c - w / 2);
  const b = stripPoint(strip, c + w / 2);
  return box(a.x + n.x * off, a.y + n.y * off, b.x + n.x * (off + d), b.y + n.y * (off + d));
}
/** Along-range of a fixture AABB projected onto its strip. */
function alongRange(strip: WallStrip, b: AABB): [number, number] {
  const p = alongOf(strip, b.min);
  const q = alongOf(strip, b.max);
  return [Math.min(p, q), Math.max(p, q)];
}
function depthOf(strip: WallStrip, b: AABB): number {
  return strip.direction.x !== 0 ? b.max.y - b.min.y : b.max.x - b.min.x;
}
function touchesStrip(b: AABB, strip: WallStrip): boolean {
  const horizontal = strip.direction.x !== 0;
  const line = horizontal ? strip.origin.y : strip.origin.x;
  const [lo, hi] = horizontal ? [b.min.y, b.max.y] : [b.min.x, b.max.x];
  const [a0, a1] = alongRange(strip, b);
  return (Math.abs(lo - line) <= 10 || Math.abs(hi - line) <= 10) && rangesIntersectMm(a0, a1, 0, strip.usableLengthMm);
}
/** Door / window keep-clear zones: door depth max(600, inward swing span); window 100 mm. */
function openingZone(o: RenderGeometry["openings"][number], strips: WallStrip[]): AABB | null {
  const wall = strips.find((w) => w.id === o.wallId);
  if (!wall) return null;
  const depth = o.kind === "door" ? Math.max(600, o.swing?.side === "in" ? o.spanMm : 0) : 100;
  return wallBox(wall, o.alongOffsetMm + o.spanMm / 2, o.spanMm, 0, depth);
}
function polygonCentroid(vertices: Vec2[]): Vec2 {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < vertices.length; i++) {
    const p = vertices[i];
    const q = vertices[(i + 1) % vertices.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  return a === 0 ? vertices[0] : { x: cx / (3 * a), y: cy / (3 * a) };
}

function buildCtx(geometry: RenderGeometry): Ctx {
  const strips = buildWallStrips(geometry.polygon);
  const fixtures: Fx[] = geometry.fixtures
    .map((f) => ({
      cls: f.fixtureClass,
      aabb: f.aabb,
      strip: strips.find((s) => s.id === f.wallStripId) ?? strips.find((s) => touchesStrip(f.aabb, s)),
      height: FIXTURE_HEIGHT[f.fixtureClass] ?? 1200,
      key: `${f.fixtureClass}|${f.aabb.min.x}|${f.aabb.min.y}|${f.aabb.max.x}|${f.aabb.max.y}|${f.modelId}`,
    }))
    .sort((p, q) => (p.key < q.key ? -1 : p.key > q.key ? 1 : 0))
    .map(({ key: _key, ...fx }) => fx);
  const clearances = fixtures.flatMap((f) => {
    if (!f.strip || !CLEARANCE_CLASSES.includes(f.cls)) return [];
    const [a0, a1] = alongRange(f.strip, f.aabb);
    return [wallBox(f.strip, (a0 + a1) / 2, a1 - a0, depthOf(f.strip, f.aabb), FRONT_CLEARANCE_MM)];
  });
  const zones = geometry.openings.map((o) => ({ o, z: openingZone(o, strips) }));
  return {
    polygon: geometry.polygon,
    strips,
    openings: geometry.openings,
    doors: geometry.openings.flatMap((o) => {
      const strip = strips.find((st) => st.id === o.wallId);
      return o.kind === "door" && strip ? [{ strip, a0: o.alongOffsetMm, a1: o.alongOffsetMm + o.spanMm }] : [];
    }),
    halfT: geometry.polygon.wallThicknessMm / 2,
    fixtures,
    openingZones: zones.flatMap(({ z }) => (z ? [z] : [])),
    doorZones: zones.flatMap(({ o, z }) => (z && o.kind === "door" ? [z] : [])),
    clearances,
    floor: [],
    ceiling: [],
    surface: [],
    wall: [],
  };
}

function fixturesFor(ctx: Ctx, classes: FixtureClass[]): Fx[] {
  return classes.flatMap((cls) => ctx.fixtures.filter((f) => f.cls === cls));
}
function anchorFixtures(ctx: Ctx, anchor: DecorAnchor): Fx[] {
  switch (anchor) {
    case "above-basin":
      return fixturesFor(ctx, ["basin", "vanity"]);
    case "above-vanity":
    case "on-vanity":
      return fixturesFor(ctx, ["vanity", "basin"]);
    case "beside-toilet":
      return fixturesFor(ctx, ["toilet"]);
    case "beside-shower":
      return fixturesFor(ctx, ["shower", "tub"]);
    default:
      return [];
  }
}

// --- floor ---------------------------------------------------------------

function cornerSpots(ctx: Ctx, dims: Dims): Spot[] {
  const g = ctx.halfT + GAP_MM;
  return ctx.polygon.vertices.flatMap((v) =>
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => ({
      plan: box(v.x + sx * g, v.y + sy * g, v.x + sx * (g + dims.w), v.y + sy * (g + dims.d)),
      rot: 0,
      y: dims.h / 2,
    })),
  );
}
function gridSpots(ctx: Ctx, dims: Dims, y: number): Spot[] {
  const c = polygonCentroid(ctx.polygon.vertices);
  const offsets: [number, number][] = [];
  for (let i = -20; i <= 20; i++) for (let j = -20; j <= 20; j++) offsets.push([i, j]);
  offsets.sort((p, q) => p[0] ** 2 + p[1] ** 2 - (q[0] ** 2 + q[1] ** 2) || p[0] - q[0] || p[1] - q[1]);
  return offsets.map(([i, j]) => {
    const x = c.x + i * GRID_STEP_MM;
    const yy = c.y + j * GRID_STEP_MM;
    return { plan: box(x - dims.w / 2, yy - dims.d / 2, x + dims.w / 2, yy + dims.d / 2), rot: 0, y };
  });
}
/** Wall-backed floor spots on both sides of an along-range [a0, a1] of a strip. */
function besideSpots(ctx: Ctx, strip: WallStrip, a0: number, a1: number, dims: Dims): Spot[] {
  const off = ctx.halfT + GAP_MM;
  return [a0 - GAP_MM - dims.w / 2, a1 + GAP_MM + dims.w / 2].map((c) => ({
    plan: wallBox(strip, c, dims.w, off, dims.d),
    rot: inwardRotation(strip),
    y: dims.h / 2,
  }));
}
function floorSpots(ctx: Ctx, type: DecorType, anchor: DecorAnchor, dims: Dims): Spot[] {
  const fx = anchorFixtures(ctx, anchor).filter((f): f is Fx & { strip: WallStrip } => f.strip !== undefined);
  const first: Spot[] = [];
  if (type === "rug" && ["above-vanity", "above-basin", "on-vanity"].includes(anchor)) {
    // In front of the vanity/basin (rugs may lie in front clearance, never under a fixture).
    for (const f of fx) {
      const [a0, a1] = alongRange(f.strip, f.aabb);
      for (const shift of [0, -1, 1, -2, 2]) {
        const c = (a0 + a1) / 2 + shift * GRID_STEP_MM;
        first.push({ plan: wallBox(f.strip, c, dims.w, depthOf(f.strip, f.aabb) + GAP_MM, dims.d), rot: inwardRotation(f.strip), y: dims.h / 2 });
      }
    }
  } else {
    for (const f of fx) first.push(...besideSpots(ctx, f.strip, ...alongRange(f.strip, f.aabb), dims));
  }
  if (anchor === "door-side") {
    for (const d of ctx.doors) first.push(...besideSpots(ctx, d.strip, d.a0, d.a1, dims));
  }
  const grid = gridSpots(ctx, dims, dims.h / 2);
  const corners = cornerSpots(ctx, dims);
  return type === "rug" || anchor === "center-floor" || anchor === "ceiling-center"
    ? [...first, ...grid, ...corners]
    : [...first, ...corners, ...grid];
}
function floorOk(ctx: Ctx, plan: AABB, type: DecorType): boolean {
  if (!aabbInsidePolygonMm(expand(plan, ctx.halfT), ctx.polygon)) return false;
  const blockers = [...ctx.fixtures.map((f) => f.aabb), ...ctx.openingZones, ...ctx.floor, ...(type === "rug" ? [] : ctx.clearances)];
  return !blockers.some((b) => aabbIntersectsMm(plan, b));
}

// --- wall ----------------------------------------------------------------

function wallSpot(ctx: Ctx, strip: WallStrip, c: number, dims: Dims, y: number): Spot {
  return { plan: wallBox(strip, c, dims.w, ctx.halfT, dims.d), rot: inwardRotation(strip), y, wall: { stripId: strip.id, c } };
}
function wallSpots(ctx: Ctx, type: DecorType, anchor: DecorAnchor, dims: Dims): Spot[] {
  const y = WALL_CENTRE_Y[type] ?? 1500;
  const out: Spot[] = [];
  if (type === "sconce") {
    for (const m of ctx.wall.filter((p) => p.type === "mirror" || p.type === "backlit-mirror")) {
      const strip = ctx.strips.find((s) => s.id === m.stripId)!;
      for (const side of [-1, 1]) out.push(wallSpot(ctx, strip, m.c + side * (m.w / 2 + 80 + dims.w / 2), dims, y));
    }
  }
  for (const f of anchorFixtures(ctx, anchor)) {
    if (!f.strip) continue;
    const [a0, a1] = alongRange(f.strip, f.aabb);
    if (anchor === "above-basin" || anchor === "above-vanity" || anchor === "on-vanity") {
      out.push(wallSpot(ctx, f.strip, (a0 + a1) / 2, dims, Math.max(y, f.height + 100 + dims.h / 2)));
    } else {
      for (const c of [a0 - 100 - dims.w / 2, a1 + 100 + dims.w / 2]) out.push(wallSpot(ctx, f.strip, c, dims, y));
    }
  }
  if (anchor === "door-side") {
    for (const d of ctx.doors) for (const c of [d.a0 - 100 - dims.w / 2, d.a1 + 100 + dims.w / 2]) out.push(wallSpot(ctx, d.strip, c, dims, y));
  }
  // Free-wall fallback: longest walls first, centre outwards in grid steps.
  const byLength = [...ctx.strips].sort((p, q) => q.usableLengthMm - p.usableLengthMm || (p.id < q.id ? -1 : 1));
  for (const strip of byLength) {
    const mid = strip.usableLengthMm / 2;
    for (let k = 0; k * GRID_STEP_MM <= mid; k++) {
      out.push(wallSpot(ctx, strip, mid + k * GRID_STEP_MM, dims, y));
      if (k > 0) out.push(wallSpot(ctx, strip, mid - k * GRID_STEP_MM, dims, y));
    }
  }
  return out;
}
function wallOk(ctx: Ctx, spot: Spot, dims: Dims): boolean {
  const strip = ctx.strips.find((s) => s.id === spot.wall!.stripId)!;
  const c = spot.wall!.c;
  const [c0, c1] = [c - dims.w / 2, c + dims.w / 2];
  const [y0, y1] = [spot.y - dims.h / 2, spot.y + dims.h / 2];
  const endGap = ctx.halfT + 20;
  if (c0 < endGap || c1 > strip.usableLengthMm - endGap || y0 < GAP_MM || y1 > WALL_HEIGHT_MM - GAP_MM) return false;
  for (const o of ctx.openings) {
    if (o.wallId !== strip.id || !rangesIntersectMm(c0, c1, o.alongOffsetMm, o.alongOffsetMm + o.spanMm)) continue;
    if (o.kind === "door" || rangesIntersectMm(y0, y1, WINDOW_BAND_MM[0], WINDOW_BAND_MM[1])) return false;
  }
  if (!aabbInsidePolygonMm(spot.plan, ctx.polygon)) return false;
  // Above a fixture only with clearance; never on a shower's wall span.
  if (ctx.fixtures.some((f) => aabbIntersectsMm(spot.plan, f.aabb) && (f.cls === "shower" || y0 < f.height + GAP_MM))) return false;
  if (y0 < DOOR_HEIGHT_MM && ctx.doorZones.some((z) => aabbIntersectsMm(spot.plan, z))) return false;
  return !ctx.wall.some((p) => aabbIntersectsMm(spot.plan, p.plan) && rangesIntersectMm(y0, y1, p.y0, p.y1));
}

// --- ceiling / surface ---------------------------------------------------

function ceilingSpots(ctx: Ctx, anchor: DecorAnchor, dims: Dims): Spot[] {
  const y = WALL_HEIGHT_MM - PENDANT_DROP_MM - dims.h / 2;
  const over = ["above-vanity", "above-basin", "on-vanity"].includes(anchor) ? anchorFixtures(ctx, anchor) : [];
  const first = over.map((f) => {
    const c = centre(f.aabb);
    return { plan: box(c.x - dims.w / 2, c.y - dims.d / 2, c.x + dims.w / 2, c.y + dims.d / 2), rot: f.strip ? inwardRotation(f.strip) : 0, y };
  });
  return [...first, ...gridSpots(ctx, dims, y)];
}
function ceilingOk(ctx: Ctx, plan: AABB): boolean {
  if (!aabbInsidePolygonMm(expand(plan, ctx.halfT), ctx.polygon)) return false;
  if (ctx.fixtures.some((f) => f.cls === "shower" && aabbIntersectsMm(plan, f.aabb))) return false;
  return !ctx.ceiling.some((b) => aabbIntersectsMm(plan, b));
}
function surfaceSpots(ctx: Ctx, anchor: DecorAnchor, dims: Dims): { spot: Spot; host: Fx }[] {
  // Only a vanity top is a surface: a standalone basin's AABB is the bowl itself, so
  // "on" it would put items in the sink (they fall back to the floor instead).
  const hosts = fixturesFor(ctx, ["vanity"]);
  return hosts.flatMap((host) => {
    if (!host.strip) return [];
    const [a0, a1] = alongRange(host.strip, host.aabb);
    const off = ctx.halfT + 40;
    return [a0 + 60 + dims.w / 2, a1 - 60 - dims.w / 2, (a0 + a1) / 2].map((c) => ({
      spot: { plan: wallBox(host.strip!, c, dims.w, off, dims.d), rot: inwardRotation(host.strip!), y: host.height + dims.h / 2 },
      host,
    }));
  });
}
function surfaceOk(ctx: Ctx, plan: AABB, host: Fx): boolean {
  if (!contains(host.aabb, plan)) return false;
  if (ctx.fixtures.some((f) => f !== host && aabbIntersectsMm(plan, f.aabb))) return false;
  return !ctx.surface.some((b) => aabbIntersectsMm(plan, b));
}

function scaledDims(type: DecorType, size: DecorItemProposal["size"]): Dims {
  const k = SIZE_SCALE[size];
  const b = BASE_DIMS[type];
  return { w: roundMm(b.w * k), h: type === "rug" ? b.h : roundMm(b.h * k), d: roundMm(b.d * k) };
}

/** Deterministic placement. Items with no legal spot are skipped. Fixtures are
 *  canonically sorted first, so input fixture order does not affect the result. */
export function placeDecor(proposal: DecorProposal, geometry: RenderGeometry): PlacedDecor[] {
  const ctx = buildCtx(geometry);
  const out: PlacedDecor[] = [];
  let lights = 0;
  proposal.items.forEach((item, index) => {
    const light = isLight(item.type);
    if (light && lights >= MAX_DECOR_LIGHTS) return;
    const dims = scaledDims(item.type, item.size);
    let mount = MOUNT_BY_TYPE[item.type];
    let spot: Spot | undefined;
    if (mount === "surface") {
      const found = ["on-vanity", "above-vanity", "above-basin"].includes(item.anchor)
        ? surfaceSpots(ctx, item.anchor, dims).find(({ spot: s, host }) => surfaceOk(ctx, s.plan, host))
        : undefined;
      if (found) {
        spot = found.spot;
        ctx.surface.push(spot.plan);
      } else {
        mount = "floor";
      }
    }
    if (mount === "floor") {
      spot = floorSpots(ctx, item.type, item.anchor, dims).find((s) => floorOk(ctx, s.plan, item.type));
      if (spot) ctx.floor.push(spot.plan);
    } else if (mount === "wall") {
      spot = wallSpots(ctx, item.type, item.anchor, dims).find((s) => wallOk(ctx, s, dims));
      if (spot) {
        ctx.wall.push({ type: item.type, stripId: spot.wall!.stripId, c: spot.wall!.c, w: dims.w, plan: spot.plan, y0: spot.y - dims.h / 2, y1: spot.y + dims.h / 2 });
      }
    } else if (mount === "ceiling") {
      spot = ceilingSpots(ctx, item.anchor, dims).find((s) => ceilingOk(ctx, s.plan));
      if (spot) ctx.ceiling.push(spot.plan);
    }
    if (!spot) return;
    const c = centre(spot.plan);
    const isMirror = item.type === "mirror" || item.type === "backlit-mirror";
    const palette = proposal.style.palette;
    const placed: PlacedDecor = {
      id: `decor-${index}-${item.type}`,
      type: item.type,
      mount,
      positionMm: { x: roundMm(c.x), y: roundMm(spot.y), z: roundMm(c.y) },
      rotationY: spot.rot,
      sizeMm: dims,
      color: isMirror ? GLASS_HEX : item.color ?? palette[index % palette.length] ?? "#cccccc",
      metal: proposal.style.metal,
    };
    if (light) {
      placed.light = { color: LIGHT_HEX[proposal.style.lightTemp], intensity: LIGHT_INTENSITY[item.type] ?? 1 };
      lights++;
    }
    out.push(placed);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Offline fallback

const PALETTES = {
  warm: ["#8b5e3c", "#c89f7a", "#e8d5b7", "#5a6b4f"],
  cool: ["#5b7c99", "#a9c4d6", "#e6eef2", "#2f4858"],
  luxe: ["#1f2a36", "#c9a45c", "#f3ede2", "#6b4e3d"],
  neutral: ["#d9d4cc", "#7a8b7f", "#3f4a52", "#f2efe9"],
};

/** Curated décor for a style preset (styles.ts); deterministic and needs no AI call. */
export function styleDecorProposal(preset: StylePreset): DecorProposal {
  const def = STYLES[preset];
  return {
    style: { palette: [...def.palette], metal: def.metal, lightTemp: def.lightTemp, preset },
    items: def.items.map((item) => ({ ...item })).slice(0, MAX_DECOR_ITEMS),
  };
}

/** Deterministic taste-keyword fallback used when NIM is unavailable. An explicit style
 *  preset wins; otherwise a preset named by the taste text only sets room materials. */
export function offlineDecorProposal(tasteText: string, preset?: StylePreset): DecorProposal {
  if (preset) return styleDecorProposal(preset);
  const detected = detectStylePreset(tasteText);
  const t = tasteText.toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));
  const plants = has("plant", "green", "natural", "biophilic", "botanical");
  const warm = has("warm", "cozy", "cosy", "wood", "earthy", "rustic");
  const cool = has("cool", "fresh", "coastal", "blue", "ocean");
  const minimal = has("minimal", "clean", "simple");
  const luxury = has("luxury", "luxurious", "gold", "brass", "glam");
  const black = has("black", "industrial");
  const spa = has("spa", "zen", "calm", "relax");

  const style: DecorStyle = {
    palette: [...(luxury ? PALETTES.luxe : warm ? PALETTES.warm : cool ? PALETTES.cool : PALETTES.neutral)],
    metal: luxury ? "brass" : black ? "black" : warm ? "nickel" : "chrome",
    lightTemp: warm || spa ? "warm" : cool ? "cool" : "neutral",
    ...(detected ? { preset: detected } : {}),
  };
  const mirror: DecorType = luxury || minimal ? "backlit-mirror" : "mirror";
  const items: DecorItemProposal[] = minimal
    ? [
        { type: mirror, anchor: "above-basin", size: "m" },
        { type: "pendant", anchor: "ceiling-center", size: "s" },
        { type: "plant", anchor: "corner", size: "m" },
        { type: "towel", anchor: "beside-shower", size: "s" },
        { type: "rug", anchor: "center-floor", size: "s" },
      ]
    : [
        { type: mirror, anchor: "above-basin", size: "m" },
        { type: "sconce", anchor: "above-basin", size: "m" },
        { type: "pendant", anchor: "ceiling-center", size: "m" },
        { type: "plant", anchor: "corner", size: "m" },
        { type: "rug", anchor: "above-vanity", size: "m" },
        { type: "towel", anchor: "beside-shower", size: "m" },
        { type: "small-plant", anchor: "on-vanity", size: "m" },
        { type: "art", anchor: "free-wall", size: luxury ? "l" : "m" },
      ];
  if (spa) items.push({ type: "candles", anchor: "on-vanity", size: "m" }, { type: "plant", anchor: "door-side", size: "s" });
  if (spa && minimal) items.push({ type: "rug", anchor: "above-vanity", size: "m" });
  if (plants) items.push({ type: "plant", anchor: "corner", size: "l" }, { type: "small-plant", anchor: "on-vanity", size: "s" }, { type: "plant", anchor: "beside-toilet", size: "s" });
  if (warm) items.push({ type: "vase", anchor: "on-vanity", size: "m" }, { type: "stool", anchor: "beside-shower", size: "m" });
  if (luxury) items.push({ type: "vase", anchor: "on-vanity", size: "l" });
  if (black) items.push({ type: "shelf", anchor: "free-wall", size: "m" });
  if (cool && !minimal) items.push({ type: "towel", anchor: "beside-toilet", size: "s" });
  return { style, items: items.slice(0, MAX_DECOR_ITEMS) };
}
