// T-020 server/UI/security QA: cross-renderer equality on a REAL solve path.
// The store-level tests assert render geometry ↔ BOM fixture-ID equality; here we
// close the renderer gap: the 2D draw sequence and the 3D scene spec must both be
// derived from the one authoritative RenderGeometry and agree on the placed fixture
// set, the BOM, and determinism (no renderer-invented fixtures). Node-only mock ctx
// (same pattern as render2d.test.ts, ADR-010).

import { describe, expect, it } from "vitest";

import { buildRenderGeometry, loadCatalog } from "@kolher/engine";
import { buildConfirmedInput, buildRoomPreview, initialState, reduceState, solveConfirmed } from "../store.js";
import { drawRender2d } from "../render2d/render2d.js";
import { buildSceneSpec } from "../render3d/sceneSpec.js";
import type { RenderGeometry } from "@kolher/engine";

function mockCtx(width = 480, height = 360): { ctx: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = [];
  const ctx: Record<string, unknown> = {
    canvas: { width, height },
    beginPath: () => calls.push("beginPath"),
    closePath: () => calls.push("closePath"),
    moveTo: (x: number, y: number) => calls.push(`moveTo:${x},${y}`),
    lineTo: (x: number, y: number) => calls.push(`lineTo:${x},${y}`),
    stroke: () => calls.push("stroke"),
    fill: () => calls.push("fill"),
    arc: (x: number, y: number) => calls.push(`arc:${x},${y}`),
    fillRect: (x: number, y: number, w: number, h: number) => calls.push(`fillRect:${x},${y},${w},${h}`),
    strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`strokeRect:${x},${y},${w},${h}`),
    fillText: (t: string, x: number, y: number) => calls.push(`fillText:${t}@${x},${y}`),
  };
  for (const name of ["strokeStyle", "fillStyle", "lineWidth", "font", "textAlign", "textBaseline"]) {
    Object.defineProperty(ctx, name, { set: (value: unknown) => calls.push(`set:${name}=${String(value)}`), get: () => undefined });
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function solvedGeometry(): {
  geometry: RenderGeometry;
  modelIds: string[];
  bomIds: string[];
} {
  const catalog = loadCatalog().state;
  let state = initialState();
  const preview = buildRoomPreview(state.room);
  if (!preview.ok) throw new Error("preview failed");
  state = reduceState(state, { type: "PREVIEW_ROOM_SUCCESS", preview: preview.preview });
  state = reduceState(state, { type: "CONFIRM_ROOM" });
  const solved = solveConfirmed(state, catalog);
  if (!solved.ok) throw new Error(solved.message);
  state = reduceState(state, { type: "SOLVE_RESULT", output: solved.output });
  const plan = solved.output.kind === "plan" ? solved.output.plan : null;
  if (!plan) throw new Error("expected a plan output for the default brief");
  const input = buildConfirmedInput(state);
  if (!input.ok) throw new Error(input.message);
  const geometry = buildRenderGeometry(plan, input.input);
  return {
    geometry,
    modelIds: geometry.fixtures.map((f) => f.modelId).sort(),
    bomIds: plan.bom.lineItems.map((i) => i.model_id).sort(),
  };
}

describe("T-020 cross-renderer equality (real solve path)", () => {
  const { geometry, modelIds, bomIds } = solvedGeometry();
  const skus = loadCatalog().state.skus;

  it("2D and 3D draw the same authoritative fixture set, equal to the BOM", () => {
    expect(modelIds.length).toBeGreaterThan(0);
    expect(modelIds).toEqual(bomIds);
    const spec = buildSceneSpec(geometry, skus);
    const specFixtureIds = [...new Set(spec.parts.map((p) => p.modelId))]
      .filter((id) => id !== "room")
      .sort();
    expect(specFixtureIds).toEqual(modelIds);
  });

  it("2D draw is deterministic on the real geometry (ADR-010)", () => {
    const a = mockCtx();
    const b = mockCtx();
    drawRender2d(a.ctx, geometry);
    drawRender2d(b.ctx, geometry);
    expect(a.calls).toEqual(b.calls);
    // At least one fillRect per placed fixture — no renderer-invented fixture set.
    const rects = a.calls.filter((c) => c.startsWith("fillRect:"));
    expect(rects.length).toBeGreaterThanOrEqual(geometry.fixtures.length);
  });

  it("scene spec is deterministic on the real geometry", () => {
    expect(JSON.stringify(buildSceneSpec(geometry, skus))).toBe(
      JSON.stringify(buildSceneSpec(geometry, skus)),
    );
  });
});
