// T-014 projection math (pure, no DOM): uniform mm→px scale fitting the bounding box
// of the polygon vertices + fixture AABBs into a padded canvas rect, with the ONE
// canonical y-flip (engine coordinates are y-up per contracts/fixtures.ts; canvas is
// y-down). Everything downstream of computeView/toCanvas is a pure affine map.
// Millimetres only; canvas transform is pure math (PRD §12, ADR-010).

import type { AABB, RenderGeometry, Vec2 } from "@kolher/engine";

export interface View {
  scale: number; // px per mm, uniform
  minX: number; // engine-mm bbox of the scene
  minY: number;
  maxY: number;
  offsetX: number; // px padding
  offsetY: number;
}

/** Engine-mm bounding box of the whole scene: polygon vertices ∪ fixture AABBs. */
export function sceneBBox(geometry: RenderGeometry): { min: Vec2; max: Vec2 } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const take = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const p of geometry.polygon.vertices) take(p.x, p.y);
  for (const f of geometry.fixtures) {
    take(f.aabb.min.x, f.aabb.min.y);
    take(f.aabb.max.x, f.aabb.max.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/** Uniform-scale fit view. Degenerate zero-extent axes fall back to scale 1 (never
 *  Infinity). Deterministic. */
export function computeView(
  geometry: RenderGeometry,
  width: number,
  height: number,
  paddingPx: number,
): View {
  const bbox = sceneBBox(geometry);
  const wMm = bbox.max.x - bbox.min.x;
  const hMm = bbox.max.y - bbox.min.y;
  const scaleX = wMm > 0 ? (width - 2 * paddingPx) / wMm : 1;
  const scaleY = hMm > 0 ? (height - 2 * paddingPx) / hMm : 1;
  return {
    scale: Math.min(scaleX, scaleY),
    minX: bbox.min.x,
    minY: bbox.min.y,
    maxY: bbox.max.y,
    offsetX: paddingPx,
    offsetY: paddingPx,
  };
}

/** Pure affine map engine-mm → canvas px (y-flip happens HERE and only here). */
export function toCanvas(view: View, x: number, y: number): Vec2 {
  return {
    x: view.offsetX + (x - view.minX) * view.scale,
    y: view.offsetY + (view.maxY - y) * view.scale,
  };
}

export interface CanvasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** AABB → canvas px rect (top-left origin). */
export function aabbToCanvas(view: View, aabb: AABB): CanvasRect {
  const topLeft = toCanvas(view, aabb.min.x, aabb.max.y);
  return {
    x: topLeft.x,
    y: topLeft.y,
    w: (aabb.max.x - aabb.min.x) * view.scale,
    h: (aabb.max.y - aabb.min.y) * view.scale,
  };
}
