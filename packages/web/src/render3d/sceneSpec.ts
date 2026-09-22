// T-015 procedural 3D scene spec (pure, no DOM, no three.js): translates the engine's
// RenderGeometry + catalog geometry_descriptor primitives into an ordered list of
// primitive specs. `render = catalog geometry`: fixture shapes never come from the UI.

import {
  buildWallStrips,
  stripLengthMm,
  stripPoint,
  stripInwardNormal,
  type AABB,
  type FixtureClass,
  type GeoPrimitive,
  type Opening,
  type RenderGeometry,
  type SKU,
  type WallStrip,
} from "@kolher/engine";
import { FINISHES, mountElevationMm } from "@kolher/engine";

/** Fixed room constants (deterministic; not data-dependent). */
export const WALL_HEIGHT_MM = 2400;
export const FLOOR_THICKNESS_MM = 100;

const ROOM_HEX = "#9ca3af";
const CERAMIC_WHITE_HEX = "#F6F7F8";

/** Material color for a chosen finish id, from the catalog FINISHES table. */
export function finishHex(finish: string | undefined): string {
  if (finish === undefined) return CERAMIC_WHITE_HEX;
  const f = FINISHES.find((row) => row.id === finish);
  return f ? f.swatchHex : CERAMIC_WHITE_HEX;
}

/** One drawable primitive, world-positioned (mm), already material-mapped. */
export interface PartSpec {
  /** BOM/catalog provenance ("room" for shell parts; otherwise SKU model_id). */
  modelId: string;
  fixtureClass: FixtureClass | "room";
  part: string;
  shape: GeoPrimitive["kind"];
  /** Center of the primitive in 3D world mm (x = room x, y = height, z = room y). */
  positionMm: { x: number; y: number; z: number };
  /** Rotation around the three.js up axis, for axis-aligned room-wall frames. */
  rotationY: number;
  colorHex: string;
  /** Finish id for PBR material lookup (undefined for room/deco). */
  finishId?: string;
  /** Override material properties for special cases (decor items). */
  materialProps?: { roughness: number; metalness: number };
  /** Catalog product name (drives the presentation-only detail mesh variant). */
  productName?: string;
  /** Room walls only: unit normal (x, z) pointing into the room. */
  inward?: { x: number; z: number };
}

/** Window sill / head heights (mm). Doors run floor to DOOR_HEAD_MM. */
export const WINDOW_SILL_MM = 900;
export const WINDOW_HEAD_MM = 2100;
export const DOOR_HEAD_MM = 2100;

/** One door/window gap, framed in 3D: centre on the wall line, wall rotation, inward normal. */
export interface OpeningSpec {
  id: string;
  kind: "door" | "window";
  centerMm: { x: number; z: number };
  rotationY: number;
  inward: { x: number; z: number };
  spanMm: number;
  bottomMm: number;
  topMm: number;
  wallThicknessMm: number;
}

export interface SceneSpec {
  parts: PartSpec[];
  openings: OpeningSpec[];
}

function boxPart(
  modelId: string,
  fixtureClass: PartSpec["fixtureClass"],
  part: string,
  sizeMm: { w: number; h: number; d: number },
  centerMm: { x: number; y: number; z: number },
  colorHex: string,
  rotationY = 0,
): PartSpec {
  return {
    modelId,
    fixtureClass,
    part,
    shape: { shape: "box", sizeMm } as GeoPrimitive["kind"],
    positionMm: centerMm,
    rotationY,
    colorHex,
  };
}

interface FixtureFrame {
  alongAnchor: number;
  depthAnchor: number;
  alongAxis: "x" | "y";
  alongSign: 1 | -1;
  depthSign: 1 | -1;
  rotationY: number;
}

function descriptorXBounds(sku: SKU): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const prim of sku.geometry_descriptor.primitives) {
    if (prim.kind.shape === "box") {
      min = Math.min(min, prim.offsetMm.x);
      max = Math.max(max, prim.offsetMm.x + prim.kind.sizeMm.w);
    } else {
      min = Math.min(min, prim.offsetMm.x - prim.kind.radiusMm);
      max = Math.max(max, prim.offsetMm.x + prim.kind.radiusMm);
    }
  }
  return { min, max };
}

/** Resolve a deterministic wall-facing frame from the authoritative fixture AABB. */
function fixtureFrame(
  fixture: { modelId: string; aabb: AABB; wallStripId?: string },
  sku: SKU,
  polygon: RenderGeometry["polygon"],
  strips: WallStrip[],
): FixtureFrame {
  const minX = Math.min(...polygon.vertices.map((p) => p.x));
  const maxX = Math.max(...polygon.vertices.map((p) => p.x));
  const minY = Math.min(...polygon.vertices.map((p) => p.y));
  const maxY = Math.max(...polygon.vertices.map((p) => p.y));
  const { aabb } = fixture;
  const close = (a: number, b: number) => Math.abs(a - b) <= 10;

  // Solver placements are wall-flush. AABB boundary contact identifies the wall;
  // this also works for vertical side walls, which need a rotated Three.js box.
  const assignedWall = fixture.wallStripId === undefined
    ? undefined
    : strips.find((strip) => strip.id === fixture.wallStripId)?.wallSide;
  const wall = assignedWall ?? (close(aabb.min.y, minY)
    ? "top"
    : close(aabb.max.y, maxY)
      ? "bottom"
      : close(aabb.min.x, minX)
        ? "left"
        : close(aabb.max.x, maxX)
          ? "right"
          : undefined);
  if (!wall) throw new Error(`buildSceneSpec: fixture ${fixture.modelId} is not wall-flush`);

  const centered = descriptorXBounds(sku).min < -10;
  const horizontal = wall === "top" || wall === "bottom";
  const alongAxis = horizontal ? "x" : "y";
  const alongSign: 1 | -1 = wall === "bottom" || wall === "left" ? -1 : 1;
  const depthSign: 1 | -1 = wall === "top" || wall === "left" ? 1 : -1;
  const alongMin = horizontal ? aabb.min.x : aabb.min.y;
  const alongMax = horizontal ? aabb.max.x : aabb.max.y;
  const depthAnchor = wall === "top" ? minY : wall === "bottom" ? maxY : wall === "left" ? minX : maxX;
  const alongAnchor = centered
    ? (alongMin + alongMax) / 2
    : alongSign === 1
      ? alongMin
      : alongMax;
  const rotationY = wall === "top" ? 0 : wall === "bottom" ? Math.PI : wall === "left" ? Math.PI / 2 : -Math.PI / 2;
  return { alongAnchor, depthAnchor, alongAxis, alongSign, depthSign, rotationY };
}

function worldCoordinate(
  frame: FixtureFrame,
  localAlong: number,
  localDepth: number,
): { x: number; z: number } {
  const along = frame.alongAnchor + frame.alongSign * localAlong;
  const depth = frame.depthAnchor + frame.depthSign * localDepth;
  return frame.alongAxis === "x" ? { x: along, z: depth } : { x: depth, z: along };
}

/** Descriptor primitive → world spec. Catalog y is height and z is depth (§6.1). */
function primitivePart(fixture: {
  modelId: string;
  fixtureClass: FixtureClass;
  aabb: AABB;
  finish?: string;
  prim: GeoPrimitive;
  sku: SKU;
  polygon: RenderGeometry["polygon"];
  strips: WallStrip[];
}): PartSpec {
  const { prim } = fixture;
  const frame = fixtureFrame(fixture, fixture.sku, fixture.polygon, fixture.strips);
  const kind = prim.kind;
  let width: number;
  let depth: number;
  let height: number;
  let localAlong: number;
  let localDepth: number;
  if (kind.shape === "box") {
    width = kind.sizeMm.w;
    depth = kind.sizeMm.d;
    height = kind.sizeMm.h;
    localAlong = prim.offsetMm.x + width / 2;
    localDepth = prim.offsetMm.z + depth / 2;
  } else {
    width = kind.radiusMm * 2;
    depth = width;
    height = kind.hMm;
    localAlong = prim.offsetMm.x;
    localDepth = prim.offsetMm.z;
  }
  const { x, z } = worldCoordinate(frame, localAlong, localDepth);
  return {
    modelId: fixture.modelId,
    fixtureClass: fixture.fixtureClass,
    part: prim.part,
    shape: kind,
    positionMm: { x, y: mountElevationMm(fixture.sku) + prim.offsetMm.y + height / 2, z },
    rotationY: frame.rotationY,
    colorHex: prim.finishable && fixture.finish !== undefined ? finishHex(fixture.finish) : CERAMIC_WHITE_HEX,
    finishId: prim.finishable && fixture.finish !== undefined ? fixture.finish : undefined,
    productName: fixture.sku.name,
  };
}

/** Fixture → catalog descriptor parts. Missing descriptors are hard contract errors:
 * rendering a guessed fallback would violate render = catalog geometry. */
function fixtureParts(
  f: RenderGeometry["fixtures"][number],
  skuByModel: Map<string, SKU>,
  polygon: RenderGeometry["polygon"],
  strips: WallStrip[],
): PartSpec[] {
  const sku = skuByModel.get(f.modelId);
  if (!sku) throw new Error(`buildSceneSpec: missing catalog SKU for ${f.modelId}`);
  return sku.geometry_descriptor.primitives.map((prim) =>
    primitivePart({ modelId: f.modelId, fixtureClass: f.fixtureClass, aabb: f.aabb, finish: f.finish, prim, sku, polygon, strips }),
  );
}

/** Wall strips → solid ranges with openings removed (sorted). */
export function wallSolidRanges(strips: WallStrip[], openings: Opening[]): Map<string, [number, number][]> {
  const ranges = new Map<string, [number, number][]>();
  for (const strip of strips) {
    const length = stripLengthMm(strip);
    const holes = openings
      .filter((o) => o.wallId === strip.id)
      .map((o) => [o.alongOffsetMm, o.alongOffsetMm + o.spanMm] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const solid: [number, number][] = [];
    let cursor = 0;
    for (const [h0, h1] of holes) {
      if (h0 > cursor) solid.push([cursor, Math.min(h0, length)]);
      cursor = Math.max(cursor, h1);
    }
    if (cursor < length) solid.push([cursor, length]);
    ranges.set(strip.id, solid.filter(([a, b]) => b - a > 0));
  }
  return ranges;
}

/** Build the full scene: room shell, opening gaps, then catalog descriptor parts. */
export function buildSceneSpec(geometry: RenderGeometry, skus: SKU[]): SceneSpec {
  const skuByModel = new Map(skus.map((s) => [s.model_id, s]));
  const parts: PartSpec[] = [];
  const xs = geometry.polygon.vertices.map((p) => p.x);
  const ys = geometry.polygon.vertices.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  parts.push(boxPart("room", "room", "floor", { w: maxX - minX, h: FLOOR_THICKNESS_MM, d: maxY - minY }, {
    x: (minX + maxX) / 2,
    y: -FLOOR_THICKNESS_MM / 2,
    z: (minY + maxY) / 2,
  }, ROOM_HEX));

  const strips = buildWallStrips(geometry.polygon);
  const t = geometry.polygon.wallThicknessMm;
  const solids = wallSolidRanges(strips, geometry.openings);
  for (const strip of strips) {
    const n = stripInwardNormal(strip.wallSide);
    for (const [a, b] of solids.get(strip.id) ?? []) {
      const p0 = stripPoint(strip, a);
      const p1 = stripPoint(strip, b);
      const length = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      parts.push({ ...boxPart("room", "room", `wall-${strip.id}-${a}-${b}`, { w: length, h: WALL_HEIGHT_MM, d: t }, {
        x: (p0.x + p1.x) / 2,
        y: WALL_HEIGHT_MM / 2,
        z: (p0.y + p1.y) / 2,
      }, ROOM_HEX, Math.atan2(-(p1.y - p0.y), p1.x - p0.x)), inward: { x: n.x, z: n.y } });
    }
  }

  // Openings: wall infill below the sill / above the head, plus the frame spec.
  const openings: OpeningSpec[] = [];
  for (const o of geometry.openings) {
    const strip = strips.find((st) => st.id === o.wallId);
    if (!strip) continue;
    const p0 = stripPoint(strip, o.alongOffsetMm);
    const p1 = stripPoint(strip, o.alongOffsetMm + o.spanMm);
    const rotationY = Math.atan2(-(p1.y - p0.y), p1.x - p0.x);
    const center = { x: (p0.x + p1.x) / 2, z: (p0.y + p1.y) / 2 };
    const kind = o.kind === "door" ? "door" : "window";
    const bottom = kind === "door" ? 0 : WINDOW_SILL_MM;
    const top = kind === "door" ? DOOR_HEAD_MM : WINDOW_HEAD_MM;
    const n = stripInwardNormal(strip.wallSide);
    const infill = (name: string, y0: number, y1: number): void => {
      if (y1 - y0 > 0) parts.push({ ...boxPart("room", "room", `wall-${strip.id}-${name}-${o.id}`, { w: o.spanMm, h: y1 - y0, d: t }, { x: center.x, y: (y0 + y1) / 2, z: center.z }, ROOM_HEX, rotationY), inward: { x: n.x, z: n.y } });
    };
    infill("sill", 0, bottom);
    infill("head", top, WALL_HEIGHT_MM);
    openings.push({ id: o.id, kind, centerMm: center, rotationY, inward: { x: n.x, z: n.y }, spanMm: o.spanMm, bottomMm: bottom, topMm: top, wallThicknessMm: t });
  }

  for (const fixture of geometry.fixtures) parts.push(...fixtureParts(fixture, skuByModel, geometry.polygon, strips));
  seatFaucetsOnVanities(parts);
  return { parts, openings };
}

const partHeight = (p: PartSpec): number => (p.shape.shape === "box" ? p.shape.sizeMm.h : p.shape.hMm);
/** Whether a world (x, z) point lies over a box part's footprint, in the part's wall frame. */
function overPart(p: PartSpec, x: number, z: number): boolean {
  if (p.shape.shape !== "box") return false;
  const dx = x - p.positionMm.x;
  const dz = z - p.positionMm.z;
  const along = dx * Math.cos(p.rotationY) - dz * Math.sin(p.rotationY);
  const into = dx * Math.sin(p.rotationY) + dz * Math.cos(p.rotationY);
  return Math.abs(along) <= p.shape.sizeMm.w / 2 && Math.abs(into) <= p.shape.sizeMm.d / 2;
}

/** T-032/T-034: a deck faucet on a vanity sits on the vanity top (870–880 mm), not at the
 *  standalone counter height mountElevationMm assumes, which would sink it into the top. */
function seatFaucetsOnVanities(parts: PartSpec[]): void {
  const tops = parts.filter((p) => p.fixtureClass === "vanity" && p.part === "top");
  const faucetIds = [...new Set(parts.filter((p) => p.fixtureClass === "faucet").map((p) => p.modelId))];
  for (const id of faucetIds) {
    const faucet = parts.filter((p) => p.fixtureClass === "faucet" && p.modelId === id);
    const bottom = Math.min(...faucet.map((p) => p.positionMm.y - partHeight(p) / 2));
    const cx = faucet.reduce((t, p) => t + p.positionMm.x, 0) / faucet.length;
    const cz = faucet.reduce((t, p) => t + p.positionMm.z, 0) / faucet.length;
    const host = tops.find((t) => overPart(t, cx, cz));
    if (!host) continue;
    const dy = host.positionMm.y + partHeight(host) / 2 - bottom;
    for (const p of faucet) p.positionMm = { ...p.positionMm, y: p.positionMm.y + dy };
  }
}
