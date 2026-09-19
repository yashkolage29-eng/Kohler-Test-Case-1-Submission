// T-009 objective/BOM/ranking/receipt tests: solve() returns a validated costed
// plan or a typed out-of-scope; the objective oracle selects the expected-class
// best per priority; a candidate's scores are anchor-stable (set-size
// independent); the tie-break policy is fixed; BOM totals equal plan cost and
// never exceed B_max; budget-edge raises minRaiseRequired; top-k is bounded and
// sorted; the receipt is complete (C8 in firedTrace, dataGaps, honesty frame);
// and the whole pipeline is deterministic run-to-run.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONFIG,
  loadCatalog,
  solve,
  scoreCandidate,
  compareRanked,
  evaluateC8,
} from "../index.js";
import type { InputSet } from "../contracts/input.js";
import type { Vec2 } from "../contracts/geometry.js";
import type { ScoredCandidate } from "./rank.js";
import { resolveFinishes } from "./finish.js";
import type { Candidate } from "../contracts/candidate.js";

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

const TYPICAL = makeInput();

describe("solve — plan path", () => {
  it("returns a validated costed plan for the typical brief", () => {
    const output = solve(TYPICAL, catalog);
    expect(output.kind).toBe("plan");
    if (output.kind !== "plan") return;
    const plan = output.plan;
    expect(plan.cost).toBeLessThanOrEqual(TYPICAL.budget.bMax);
    expect(plan.bom.total).toBe(plan.cost);
    const bomSum = plan.bom.lineItems.reduce((sum, li) => sum + li.price * li.qty, 0);
    expect(bomSum).toBe(plan.cost);
    expect(plan.budgetSummary.total).toBe(plan.cost);
    for (const item of plan.bom.lineItems) {
      expect(item.finish).toBeDefined();
      expect(item.qty).toBeGreaterThanOrEqual(1);
    }
  });

  it("carries a complete receipt: C8 verdict in firedTrace, all rules pass, honest frame", () => {
    const output = solve(TYPICAL, catalog);
    if (output.kind !== "plan") return;
    const plan = output.plan;
    const ruleIds = plan.firedTrace.map((verdict) => verdict.ruleId);
    expect(ruleIds).toContain("C8");
    expect(plan.firedTrace.every((verdict) => verdict.pass)).toBe(true);
    expect(plan.receipt.firedRuleTrace.length).toBe(plan.firedTrace.length);
    expect(Array.isArray(plan.receipt.dataGaps)).toBe(true);
    expect(plan.receipt.honestyFrame).toBeDefined();
  });
});

describe("top-k, anchor stability, budget edge, determinism, latency", () => {
  it("bounds the receipt top-k to config.topK, sorted by total descending", () => {
    const output = solve(TYPICAL, catalog);
    if (output.kind !== "plan") return;
    const topK = output.plan.receipt.topK;
    expect(topK.length).toBeGreaterThan(0);
    expect(topK.length).toBeLessThanOrEqual(DEFAULT_CONFIG.topK);
    for (let i = 1; i < topK.length; i++) {
      expect(topK[i - 1].total).toBeGreaterThanOrEqual(topK[i].total);
    }
    // The argmax is the plan's selected candidate.
    expect(topK[0].candidateId).toBe(output.plan.selectedCandidate.id);
    expect(output.plan.perTermScores).toEqual(topK[0].perTerm);
  });

  it("scores a candidate identically inside the solve and in isolation (anchor stability)", () => {
    const output = solve(TYPICAL, catalog);
    if (output.kind !== "plan") return;
    const candidate = output.plan.selectedCandidate;
    const resolved = resolveFinishes(candidate, TYPICAL, catalog);
    expect(resolved).not.toBeNull();
    if (resolved === null) return;
    const isolated = scoreCandidate(candidate, resolved, TYPICAL, catalog);
    expect(isolated).toEqual(output.plan.perTermScores);
  });

  it("sets minRaiseRequired = total − bTarget only on the budget edge", () => {
    const underTarget = solve(makeInput({ budget: { bMax: 400000, bTarget: 400000 } }), catalog);
    if (underTarget.kind === "plan") {
      expect(underTarget.plan.budgetSummary.minRaiseRequired).toBeUndefined();
    }
    const overTarget = solve(TYPICAL, catalog);
    if (overTarget.kind === "plan" && overTarget.plan.cost > TYPICAL.budget.bTarget) {
      expect(overTarget.plan.budgetSummary.minRaiseRequired).toBe(
        overTarget.plan.cost - TYPICAL.budget.bTarget,
      );
    }
  });

  it("is deterministic: two runs produce identical BuildOutput JSON", () => {
    expect(JSON.stringify(solve(TYPICAL, catalog))).toBe(
      JSON.stringify(solve(TYPICAL, catalog)),
    );
  });

  it("solves the typical brief end-to-end in under 2 s", () => {
    const start = performance.now();
    solve(TYPICAL, catalog);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("objective oracle", () => {
  it("ranks a more-luxurious candidate first under the luxury priority than under value", () => {
    const luxury = solve(makeInput({ priority: "luxury" }), catalog);
    const value = solve(makeInput({ priority: "value" }), catalog);
    expect(luxury.kind).toBe("plan");
    expect(value.kind).toBe("plan");
    if (luxury.kind !== "plan" || value.kind !== "plan") return;
    expect(luxury.plan.perTermScores.uLuxury).toBeGreaterThanOrEqual(
      value.plan.perTermScores.uLuxury,
    );
  });

  it("prefers a cheaper-or-equal plan under the value priority", () => {
    const luxury = solve(makeInput({ priority: "luxury" }), catalog);
    const value = solve(makeInput({ priority: "value" }), catalog);
    if (luxury.kind !== "plan" || value.kind !== "plan") return;
    expect(value.plan.cost).toBeLessThanOrEqual(luxury.plan.cost);
  });
});


describe("tie-break policy (OPT §13.3)", () => {
  const base: Candidate = {
    id: "a",
    classSet: ["toilet"],
    bindings: [],
    cost: 1000,
    clearanceDeltas: {},
    compatOk: true,
    geometryValid: true,
  };
  const scored = (
    id: string,
    total: number,
    uSpace: number,
    cost: number,
    fixtures: number,
  ): ScoredCandidate => ({
    candidate: {
      ...base,
      id,
      cost,
      bindings: Array.from({ length: fixtures }, (_, i) => ({
        fixture: {
          skuId: `s${i}`,
          class: "toilet" as const,
          footprintMm: { w: 400, d: 600, h: 800 },
          classAffinity: [],
          orientation: 0,
          featureTags: [],
          zones: [],
        },
        wallStripId: "wall-bottom",
        posAlongMm: i * 500,
        orientation: 0,
      })),
    },
    scores: { uCost: 0.5, uSpace, uWater: 0.5, uLuxury: 0.5, uMaintenance: 0.5 },
    total,
  });

  it("orders by total desc, then more space, then cheaper, then fewer fixtures, then id", () => {
    // Equal totals: more uSpace wins.
    expect(compareRanked(scored("b", 0.8, 0.9, 100, 2), scored("a", 0.8, 0.5, 100, 2))).toBeLessThan(0);
    // Equal uSpace: cheaper wins.
    expect(compareRanked(scored("b", 0.8, 0.5, 90, 2), scored("a", 0.8, 0.5, 100, 2))).toBeLessThan(0);
    // Equal cost: fewer fixtures wins.
    expect(compareRanked(scored("b", 0.8, 0.5, 100, 1), scored("a", 0.8, 0.5, 100, 2))).toBeLessThan(0);
    // Everything equal: lexicographic id.
    expect(compareRanked(scored("a", 0.8, 0.5, 100, 2), scored("b", 0.8, 0.5, 100, 2))).toBeLessThan(0);
  });
});

describe("out-of-scope wall (OPT §10.2.4)", () => {
  it("routes an ultra-low budget through the relaxation protocol (T-010): raise-budget menu", () => {
    const output = solve(makeInput({ budget: { bMax: 10000, bTarget: 8000 } }), catalog);
    expect(output.kind).toBe("relaxation");
    if (output.kind !== "relaxation") return;
    expect(output.menu.length).toBeGreaterThanOrEqual(1);
    expect(output.menu.some((entry) => entry.kind === "raise-budget")).toBe(true);
  });

  it("propagates the Step-01 gate through the out-of-scope wall", () => {
    const output = solve(makeInput({ confirmed: false }), catalog);
    expect(output.kind).toBe("out-of-scope");
    if (output.kind !== "out-of-scope") return;
    expect(output.outOfScope.finalBlocker).toContain("gate-blocked");
  });
});

describe("evaluateC8", () => {
  it("passes within the ceiling and fails over it, with measured deltas", () => {
    const pass = evaluateC8(100000, 250000);
    expect(pass.ruleId).toBe("C8");
    expect(pass.pass).toBe(true);
    expect(pass.measuredDeltas.budgetHeadroomInr).toBe(150000);
    const fail = evaluateC8(260000, 250000);
    expect(fail.pass).toBe(false);
    expect(fail.measuredDeltas.budgetHeadroomInr).toBe(-10000);
  });
});

describe("finish resolution (T-009 gap)", () => {
  it("resolves integer INR prices for every unique bound SKU, within B_max", () => {
    const output = solve(TYPICAL, catalog);
    if (output.kind !== "plan") return;
    const candidate = output.plan.selectedCandidate;
    const resolved = resolveFinishes(candidate, TYPICAL, catalog);
    expect(resolved).not.toBeNull();
    if (resolved === null) return;
    const uniqueCount = new Set(candidate.bindings.map((b) => b.fixture.skuId)).size;
    expect(resolved.choices.size).toBe(uniqueCount);
    let sum = 0;
    for (const choice of resolved.choices.values()) {
      expect(Number.isInteger(choice.price)).toBe(true);
      sum += choice.price;
    }
    expect(sum).toBe(resolved.cost);
    expect(resolved.cost).toBeLessThanOrEqual(TYPICAL.budget.bMax);
  });
});
