// T-014 render2d tests: Node-only (no real canvas). Uses a recorded mock
// CanvasRenderingContext2D — every method call and style set is captured as an
// entry so two draws can be compared for exact call-sequence equality (ADR-010
// determinism), and projection purity is checked as a pure affine map.

import { describe, expect, it } from "vitest";
import type { RenderGeometry, Vec2 } from "@kolher/engine";
import { aabbToCanvas, computeView, toCanvas, type View } from "./project.js";
import { drawRender2d } from "./render2d.js";

type Call = [name: string, ...args: unknown[]];

/** Recorded mock 2D context: methods append ["method", ...args]; style properties
 *  append ["set", name, value] via getters/setters (order preserved). */
function makeMockCtx(width: number, height: number) {
  const calls: Call[] = [];
  const styleNames = ["strokeStyle", "fillStyle", "lineWidth", "font", "textAlign", "textBaseline"];
  const ctx: Record<string, unknown> = {
    canvas: { width, height },
    beginPath: () => calls.push(["beginPath"]),
    closePath: () => calls.push(["closePath"]),
    moveTo: (x: number, y: number) => calls.push(["moveTo", x, y]),
    lineTo: (x: number, y: number) => calls.push(["lineTo", x, y]),
    stroke: () => calls.push(["stroke"]),
    fill: () => calls.push(["fill"]),
    arc: (x: number, y: number, r: number, a0: number, a1: number, ccw: boolean) =>
      calls.push(["arc", x, y, r, a0, a1, ccw]),
    fillRect: (x: number, y: number, w: number, h: number) =>
      calls.push(["fillRect", x, y, w, h]),
    strokeRect: (x: number, y: number, w: number, h: number) =>
      calls.push(["strokeRect", x, y, w, h]),
    fillText: (text: string, x: number, y: number) => calls.push(["fillText", text, x, y]),
  };
  for (const name of styleNames) {
    Object.defineProperty(ctx, name, {
      set: (value: unknown) => calls.push(["set", name, value]),
      get: () => undefined,
    });
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const v = (x: number, y: number): Vec2 => ({ x, y });

const GEOMETRY: RenderGeometry = {
  polygon: { vertices: [v(0, 0), v(2400, 0), v(2400, 1800), v(0, 1800)], ccw: true, wallThicknessMm: 100 },
  openings: [],
  fixtures: [
    {
      modelId: "K-TEST-0",
      fixtureClass: "toilet",
      aabb: { min: v(0, 1200), max: v(400, 1800) },
      orientationDeg: 0,
    },
  ],
  annotations: [
    { kind: "dimension", at: v(1200, 1950), text: "2400 mm" },
    { kind: "clearance", at: v(200, 1500), text: "70 mm" },
    { kind: "swing", at: v(1800, 1800), text: "door 600 mm" },
  ],
};

describe("computeView / toCanvas", () => {
  it("maps polygon bbox corners to expected px (padding, y-flip, uniform scale)", () => {
    const view = computeView(GEOMETRY, 480, 360, 20);
    // scale = min((480-40)/2400, (360-40)/1800) = height-fit.
    expect(view.scale).toBeCloseTo(320 / 1800, 12);
    const bl = toCanvas(view, 0, 0); // engine bottom-left → canvas bottom-left
    expect(bl).toEqual({ x: 20, y: 340 });
    // Height-fit: horizontal slack means the right edge is NOT width-padding away.
    const tr = toCanvas(view, 2400, 1800);
    expect(tr.x).toBeCloseTo(20 + 2400 * (320 / 1800), 12);
    expect(tr.y).toBe(20);
  });

  it("is a pure affine map: midpoints map to midpoints", () => {
    const view = computeView(GEOMETRY, 480, 360, 20);
    const mid = toCanvas(view, 1200, 900);
    const a = toCanvas(view, 0, 0);
    const b = toCanvas(view, 2400, 1800);
    expect(mid.x).toBeCloseTo((a.x + b.x) / 2, 12);
    expect(mid.y).toBeCloseTo((a.y + b.y) / 2, 12);
  });

  it("aabbToCanvas produces the top-left rect matching its corners", () => {
    const view: View = computeView(GEOMETRY, 480, 360, 20);
    const rect = aabbToCanvas(view, { min: v(0, 1200), max: v(400, 1800) });
    expect(rect.x).toBeCloseTo(20, 12);
    expect(rect.y).toBeCloseTo(20, 12);
    expect(rect.w).toBeCloseTo(400 * view.scale, 12);
    expect(rect.h).toBeCloseTo(600 * view.scale, 12);
  });
});

describe("drawRender2d", () => {
  it("is deterministic: two draws produce identical call sequences", () => {
    const first = makeMockCtx(480, 360);
    const second = makeMockCtx(480, 360);
    drawRender2d(first.ctx, GEOMETRY);
    drawRender2d(second.ctx, GEOMETRY);
    expect(JSON.stringify(first.calls)).toBe(JSON.stringify(second.calls));
  });

  it("a changed fixture AABB changes the recorded fill/stroke rect calls", () => {
    const base = makeMockCtx(480, 360);
    drawRender2d(base.ctx, GEOMETRY);
    const moved: RenderGeometry = {
      ...GEOMETRY,
      fixtures: [
        { ...GEOMETRY.fixtures[0], aabb: { min: v(100, 1200), max: v(500, 1800) } },
      ],
    };
    const changed = makeMockCtx(480, 360);
    drawRender2d(changed.ctx, moved);
    expect(JSON.stringify(changed.calls)).not.toBe(JSON.stringify(base.calls));
    const movedFill = changed.calls.find((c) => c[0] === "fillRect");
    const baseFill = base.calls.find((c) => c[0] === "fillRect");
    expect(movedFill).not.toEqual(baseFill);
  });

  it("each annotation produces exactly one fillText with its exact text at the projected point", () => {
    const { ctx, calls } = makeMockCtx(480, 360);
    drawRender2d(ctx, GEOMETRY);
    // drawRender2d uses its internal PADDING_PX = 24.
    const view = computeView(GEOMETRY, 480, 360, 24);
    const texts = calls.filter((c) => c[0] === "fillText" && typeof c[1] === "string");
    for (const annotation of GEOMETRY.annotations) {
      const at = toCanvas(view, annotation.at.x, annotation.at.y);
      const matches = texts.filter((c) => c[1] === annotation.text);
      expect(matches).toHaveLength(1);
      expect(matches[0][2]).toBeCloseTo(at.x, 9);
      expect(matches[0][3]).toBeCloseTo(at.y, 9);
    }
  });

  it("unknown fixture class falls back to the neutral gray fill", () => {
    const unknown: RenderGeometry = {
      ...GEOMETRY,
      fixtures: [
        { ...GEOMETRY.fixtures[0], fixtureClass: "mystery" as never },
      ],
    };
    const { ctx, calls } = makeMockCtx(480, 360);
    drawRender2d(ctx, unknown);
    const sets = calls.filter((c) => c[0] === "set" && c[1] === "fillStyle");
    expect(sets).toContainEqual(["set", "fillStyle", "#9ca3af"]);
  });
});

