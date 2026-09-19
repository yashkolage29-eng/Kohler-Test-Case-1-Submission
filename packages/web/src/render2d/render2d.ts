// T-014 Canvas 2D renderer (ADR-010 `render = catalog geometry`): draws ONLY what the
// engine produced — room polygon outline (lineWidth = wall thickness), openings as
// gaps on their wall strips (engine buildWallStrips/stripPoint, no renderer-side wall
// geometry), quarter-circle swing arcs (annotation of engine swing data), fixture
// AABBs with a FIXED class→color table, and annotations as text at projected `at`.
// Nothing not present in RenderGeometry is drawn; unknown fixture class → neutral
// gray, never an invented shape. All styling is fixed constants → deterministic.

import {
  buildWallStrips,
  stripInwardNormal,
  stripPoint,
  type FixtureClass,
  type Opening,
  type RenderGeometry,
  type WallStrip,
} from "@kolher/engine";
import { aabbToCanvas, computeView, toCanvas } from "./project.js";

const PADDING_PX = 24;
const ROOM_STROKE = "#111827";
const OPENING_MARK = "#6b7280";
const BACKGROUND = "#ffffff";
const LABEL_COLOR = "#111827";
const NEUTRAL_CLASS_COLOR = "#9ca3af";

/** Fixed color table over the closed FixtureClass vocabulary (contracts/vocab.ts). */
const CLASS_COLORS: Record<FixtureClass, string> = {
  toilet: "#93c5fd",
  basin: "#6ee7b7",
  faucet: "#a5f3fc",
  shower: "#fcd34d",
  tub: "#f9a8d4",
  vanity: "#c4b5fd",
  accessory: "#d1d5db",
};

const ANNOTATION_COLORS = {
  dimension: "#6b7280", // gray
  clearance: "#d97706", // amber
  swing: "#2563eb", // blue
} as const;

function classColor(cls: FixtureClass): string {
  return CLASS_COLORS[cls] ?? NEUTRAL_COLOR();
}
function NEUTRAL_COLOR(): string {
  return NEUTRAL_CLASS_COLOR;
}

/** Openings as gaps + marks on their wall strip; quarter-circle swing arc for doors
 *  with engine-defined swing (hinge at the stripPoint(alongOffset) endpoint, radius =
 *  leaf width, sweeping from the wall direction to the inward normal). */
function drawOpenings(
  ctx: CanvasRenderingContext2D,
  geometry: RenderGeometry,
  strips: WallStrip[],
  wallWidthPx: number,
): void {
  for (const opening of geometry.openings) {
    const strip = strips.find((s) => s.id === opening.wallId);
    if (!strip) continue;
    const a = toPt(stripPoint(strip, opening.alongOffsetMm));
    const b = toPt(stripPoint(strip, opening.alongOffsetMm + opening.spanMm));
    // Gap: paint over the wall with the background, then a thin mark for the span.
    ctx.strokeStyle = BACKGROUND;
    ctx.lineWidth = wallWidthPx;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = OPENING_MARK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    drawSwing(ctx, opening, strip);
  }
}

function drawSwing(ctx: CanvasRenderingContext2D, opening: Opening, strip: WallStrip): void {
  if (!opening.swing) return;
  const swing = opening.swing;
  const hinge = toPt(stripPoint(strip, opening.alongOffsetMm));
  const r = swing.leafDimsMm.w * view.scale;
  // Engine y-up → canvas y-down: flip BOTH direction vectors once here.
  const wallDir = { x: strip.direction.x, y: -strip.direction.y };
  const inward = stripInwardNormal(strip.wallSide);
  const inwardCanvas = { x: inward.x, y: -inward.y };
  const start = Math.atan2(wallDir.y, wallDir.x);
  const end = Math.atan2(inwardCanvas.y, inwardCanvas.x);
  const TAU = Math.PI * 2;
  const diff = ((end - start) % TAU + TAU) % TAU;
  // Sweep the short way from the wall direction to the inward normal.
  ctx.beginPath();
  ctx.arc(hinge.x, hinge.y, r, start, end, diff > Math.PI);
  ctx.stroke();
  // Leaf line: hinge → inward.
  ctx.beginPath();
  ctx.moveTo(hinge.x, hinge.y);
  ctx.lineTo(hinge.x + inwardCanvas.x * r, hinge.y + inwardCanvas.y * r);
  ctx.stroke();
}

// Module-scoped per-draw view (drawRender2d is single-threaded, synchronous; kept
// internal to this module so helper signatures stay small).
let view: ReturnType<typeof computeView>;

/** Point-level convenience wrapper over toCanvas. */
function toPt(p: { x: number; y: number }): { x: number; y: number } {
  return toCanvas(view, p.x, p.y);
}

/** Draw the full RenderGeometry into a 2D context. Deterministic: the same geometry
 *  and canvas size always produce the same call sequence. */
export function drawRender2d(ctx: CanvasRenderingContext2D, geometry: RenderGeometry): void {
  view = computeView(geometry, ctx.canvas.width, ctx.canvas.height, PADDING_PX);

  // Room: polygon outline with wall thickness as the stroke width (single y-flip in
  // project.ts; the polygon vertices are engine-authoritative).
  ctx.strokeStyle = ROOM_STROKE;
  ctx.lineWidth = geometry.polygon.wallThicknessMm * view.scale;
  ctx.beginPath();
  geometry.polygon.vertices.forEach((p, i) => {
    const c = toCanvas(view, p.x, p.y);
    if (i === 0) ctx.moveTo(c.x, c.y);
    else ctx.lineTo(c.x, c.y);
  });
  ctx.closePath();
  ctx.stroke();

  const strips = buildWallStrips(geometry.polygon);
  drawOpenings(ctx, geometry, strips, ctx.lineWidth);

  // Fixtures: stroke + class fill + centered modelId label. Unknown class → neutral.
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const fixture of geometry.fixtures) {
    const rect = aabbToCanvas(view, fixture.aabb);
    ctx.fillStyle = classColor(fixture.fixtureClass);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = ROOM_STROKE;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(fixture.modelId, rect.x + rect.w / 2, rect.y + rect.h / 2);
  }

  // Annotations: text exactly at the projected annotation point, color by kind.
  for (const annotation of geometry.annotations) {
    const at = toPt(annotation.at);
    ctx.fillStyle = ANNOTATION_COLORS[annotation.kind];
    ctx.fillText(annotation.text, at.x, at.y);
  }
}
