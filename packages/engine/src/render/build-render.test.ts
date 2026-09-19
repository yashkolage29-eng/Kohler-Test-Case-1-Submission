// T-014 builder tests: buildRenderGeometry must be a deterministic, ground-truth
// projection of engine geometry — fixture AABBs equal aabbForPlacement recomputed
// from the same strips, annotations come only from the fired trace + openings, and
// run-to-run output is identical (ADR-010 `render = catalog geometry`).

import { describe, expect, it } from "vitest";

import {
  aabbForPlacement,
  buildRenderGeometry,
  buildWallStrips,
  loadCatalog,
  normalizeRoomPolygon,
  solve,
} from "../index.js";
import type { Vec2 } from "../contracts/geometry.js";
import type { InputSet } from "../contracts/input.js";
import type { FixtureBinding } from "../contracts/candidate.js";
import type { Plan, BOM, BudgetSummary } from "../contracts/plan.js";
import type { DecisionReceipt, RuleVerdict } from "../contracts/receipt.js";
import type { Scores } from "../contracts/candidate.js";
import { DEFAULT_CONFIG } from "../config/config.js";

const v = (x: number, y: number): Vec2 => ({ x, y });
const RECT: Vec2[] = [v(0, 0), v(2400, 0), v(2400, 1800), v(0, 1800)];

const { state: catalog } = loadCatalog();

function makeInput(overrides: Partial<InputSet> = {}): InputSet {
  return {
    polygon: { vertices: RECT, ccw: true, wallThicknessMm: 100 },
    openings: [
      {
        id: "door-1",
        wallId: "wall-bottom",
        kind: "door" as const,
        alongOffsetMm: 1500,
        spanMm: 600,
        swing: { side: "in" as const, leafDimsMm: { w: 600, d: 25 } },
      },
    ],
    confirmed: true,
    featureConstraints: {
      requiredFeatures: [],
      preferredClasses: [],
      finishFamilies: ["white", "chrome"],
      classCountRanges: {},
    },
    priority: "balanced",
    spaciousness: "balanced",
    budget: { bMax: 250000, bTarget: 180000 },
    config: DEFAULT_CONFIG,
    ...overrides,
  };
}

/** Hand-assembled minimal valid Plan for builder-focused tests (no solve needed). */
function makePlan(bindings: FixtureBinding[], firedTrace: RuleVerdict[], bom: BOM): Plan {
  const scores: Scores = {
    uCost: 0.5,
    uSpace: 0.5,
    uWater: 0.5,
    uLuxury: 0.5,
    uMaintenance: 0.5,
  };
  const budgetSummary: BudgetSummary = { total: 1000, bTarget: 1000, bMax: 2000 };
  return {
    id: "plan-test",
    selectedCandidate: {
      id: "cand-test",
      classSet: bindings.map((b) => b.fixture.class),
      bindings,
      cost: 1000,
      clearanceDeltas: {},
      compatOk: true,
      geometryValid: true,
    },
    firedTrace,
    perTermScores: scores,
    cost: 1000,
    bom,
    budgetSummary,
    receipt: { topK: [], scoreMatrix: {}, firedRuleTrace: firedTrace, dataGaps: [] } as DecisionReceipt,
  };
}

function binding(overrides: Partial<FixtureBinding> = {}): FixtureBinding {
  return {
    fixture: {
      skuId: "K-TEST-0",
      class: "toilet",
      footprintMm: { w: 400, d: 600, h: 800 },
      classAffinity: ["toilet"],
      orientation: 0,
      featureTags: [],
      zones: ["toilet"],
    },
    wallStripId: "wall-bottom",
    posAlongMm: 0,
    orientation: 0,
    ...overrides,
  };
}

const emptyBom: BOM = { lineItems: [], total: 0, byZone: {} };

describe("buildRenderGeometry", () => {
  it("is deterministic: two calls produce identical output", () => {
    const input = makeInput();
    const output = solve(input, catalog);
    expect(output.kind).toBe("plan");
    if (output.kind !== "plan") return;
    const a = buildRenderGeometry(output.plan, input);
    const b = buildRenderGeometry(output.plan, input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("projects fixture AABBs exactly as aabbForPlacement ground truth", () => {
    const input = makeInput();
    const output = solve(input, catalog);
    expect(output.kind).toBe("plan");
    if (output.kind !== "plan") return;
    const geometry = buildRenderGeometry(output.plan, input);
    const normalized = normalizeRoomPolygon(input.polygon);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    const strips = buildWallStrips(normalized.polygon);
    expect(geometry.fixtures.length).toBe(output.plan.selectedCandidate.bindings.length);
    geometry.fixtures.forEach((fixture, i) => {
      const b = output.plan.selectedCandidate.bindings[i];
      const strip = strips.find((s) => s.id === b.wallStripId);
      expect(strip).toBeDefined();
      if (!strip) return;
      const truth = aabbForPlacement(
        strip,
        b.posAlongMm,
        { w: b.fixture.footprintMm.w, d: b.fixture.footprintMm.d },
        b.orientation,
      );
      expect(truth.ok).toBe(true);
      if (!truth.ok) return;
      expect(fixture.aabb).toEqual(truth.aabb);
      expect(fixture.modelId).toBe(b.fixture.skuId);
      expect(fixture.fixtureClass).toBe(b.fixture.class);
      expect(fixture.orientationDeg).toBe(b.orientation);
    });
  });

  it("emits dimension and swing annotations grounded in polygon + openings", () => {
    const input = makeInput();
    const output = solve(input, catalog);
    expect(output.kind).toBe("plan");
    if (output.kind !== "plan") return;
    const geometry = buildRenderGeometry(output.plan, input);
    const dims = geometry.annotations.filter((a) => a.kind === "dimension");
    expect(dims.map((a) => a.text)).toEqual(["2400 mm", "1800 mm"]);
    const swings = geometry.annotations.filter((a) => a.kind === "swing");
    expect(swings).toEqual([
      { kind: "swing", at: { x: 1800, y: 1800 }, text: "door 600 mm" },
    ]);
  });

  it("maps finish from the BOM by first model_id match, omitting when absent", () => {
    const input = makeInput();
    const plan = makePlan([binding()], [], {
      lineItems: [
        { model_id: "K-TEST-0", qty: 1, finish: "matte_black", price: 1000 },
        { model_id: "K-TEST-0", qty: 1, finish: "chrome", price: 900 },
      ],
      total: 1900,
      byZone: {},
    });
    const geometry = buildRenderGeometry(plan, input);
    expect(geometry.fixtures).toHaveLength(1);
    expect(geometry.fixtures[0].finish).toBe("matte_black");

    const noFinish = buildRenderGeometry(makePlan([binding()], [], emptyBom), input);
    expect("finish" in noFinish.fixtures[0]).toBe(false);
  });


  it("derives clearance annotations only from failing/boundary C2 verdicts", () => {
    const input = makeInput();
    const plan = makePlan(
      [binding()],
      [
        {
          ruleId: "C2",
          pass: false,
          valuesUsed: { toiletFrontMm: 600 },
          measuredDeltas: { "shortfallMm:K-TEST-0:front": 70, maxShortfallMm: 70 },
          explanation: "c2-clearance-short:K-TEST-0:front",
        },
      ],
      emptyBom,
    );
    const geometry = buildRenderGeometry(plan, input);
    const clearances = geometry.annotations.filter((a) => a.kind === "clearance");
    // Anchored at the fixture AABB center of (0,1200)-(400,1800).
    expect(clearances).toEqual([{ kind: "clearance", at: { x: 200, y: 1500 }, text: "70 mm" }]);

    const boundary = makePlan(
      [binding()],
      [
        {
          ruleId: "C2",
          pass: true,
          valuesUsed: { toiletFrontMm: 600 },
          measuredDeltas: { "minMm:toilet:front": 600, maxShortfallMm: 0 },
          explanation: "c2-pass:all-clearances-met",
        },
      ],
      emptyBom,
    );
    const boundaryGeometry = buildRenderGeometry(boundary, input);
    const boundaryClearances = boundaryGeometry.annotations.filter((a) => a.kind === "clearance");
    expect(boundaryClearances).toEqual([
      { kind: "clearance", at: { x: 200, y: 1500 }, text: "600 mm" },
    ]);
  });

  it("does not crash on a tiny valid L-shape or tiny rectangle room", () => {
    const lShape = makeInput({
      polygon: {
        vertices: [v(0, 0), v(1200, 0), v(1200, 900), v(900, 900), v(900, 1800), v(0, 1800)],
        ccw: true,
        wallThicknessMm: 100,
      },
      openings: [],
    });
    const lOutput = solve(lShape, catalog);
    if (lOutput.kind === "plan") {
      const geometry = buildRenderGeometry(lOutput.plan, lShape);
      expect(geometry.polygon.vertices).toHaveLength(6);
      expect(geometry.fixtures.length).toBe(lOutput.plan.selectedCandidate.bindings.length);
    }
    // Tiny (degenerate-scale but valid) rectangle with a hand plan: must not throw.
    const tiny = makeInput({
      polygon: {
        vertices: [v(0, 0), v(400, 0), v(400, 400), v(0, 400)],
        ccw: true,
        wallThicknessMm: 50,
      },
      openings: [],
    });
    const tinyPlan = makePlan(
      [binding({ fixture: { ...binding().fixture, skuId: "K-TINY-0" } })],
      [],
      emptyBom,
    );
    expect(() => buildRenderGeometry(tinyPlan, tiny)).not.toThrow();
  });
});

