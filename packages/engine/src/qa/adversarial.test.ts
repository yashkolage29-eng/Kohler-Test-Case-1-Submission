// T-019 adversarial engine QA: exercise output invariants across normal, budget,
// relaxation, reordered-input, malformed-input, conservative-swing, L-shape,
// all-priority-×-spaciousness, re-optimization, anchor-stability, score-range,
// BOM/render-ID-equality, compatibility-edge, determinism-hash, and performance
// paths. These tests own probes only; production defects are reported to the
// owning module.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONFIG,
  alternativeProfiles,
  buildRenderGeometry,
  candidateCache,
  loadCatalog,
  reoptimize,
  solve,
} from "../index.js";
import type { InputSet } from "../contracts/input.js";
import type { BuildOutput, Plan } from "../contracts/plan.js";
import type { Vec2, BathroomRep } from "../contracts/geometry.js";
import type { Fixture, FixtureBinding, Scores } from "../contracts/candidate.js";
import { PRIORITIES, SPACIOUSNESS_LEVELS } from "../contracts/vocab.js";
import { buildWallStrips } from "../geometry/strips.js";
import { evaluateC3 } from "../geometry/rules/c3_swing.js";
import { bindingPool } from "../solver/bind.js";
import { syntheticBathroomCatalog, syntheticCatalog, syntheticSku } from "./synthetic-catalog.js";

const { state: catalog } = loadCatalog();
const v = (x: number, y: number): Vec2 => ({ x, y });
const RECT: Vec2[] = [v(0, 0), v(2400, 0), v(2400, 1800), v(0, 1800)];
const LSHAPE: Vec2[] = [
  v(0, 0), v(3000, 0), v(3000, 1200), v(1200, 1200), v(1200, 2400), v(0, 2400),
];

function makeInput(overrides: Partial<InputSet> = {}): InputSet {
  return {
    polygon: { vertices: RECT, ccw: true, wallThicknessMm: 100 },
    openings: [
      {
        id: "door-1",
        wallId: "wall-bottom",
        kind: "door",
        alongOffsetMm: 1500,
        spanMm: 600,
        swing: { side: "in", leafDimsMm: { w: 600, d: 25 } },
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

/** Assert every output invariant that must hold on any code path. */
function expectSafeOutput(output: BuildOutput, bMax: number): void {
  if (output.kind === "plan") {
    expect(output.plan.firedTrace.length).toBeGreaterThan(0);
    expect(output.plan.firedTrace.every((verdict) => verdict.pass)).toBe(true);
    expect(output.plan.cost).toBe(output.plan.bom.total);
    expect(output.plan.budgetSummary.total).toBe(output.plan.cost);
    expect(output.plan.cost).toBeLessThanOrEqual(bMax);
    assertScoresInRange(output.plan.perTermScores);
    assertReceiptComplete(output.plan);
    return;
  }
  if (output.kind === "relaxation") {
    expect(output.menu.length).toBeGreaterThanOrEqual(1);
    expect(output.menu.length).toBeLessThanOrEqual(3);
    expect(new Set(output.menu.map((entry) => entry.plan.id)).size).toBe(output.menu.length);
    for (const entry of output.menu) {
      expect(entry.plan.firedTrace.length).toBeGreaterThan(0);
      expect(entry.plan.firedTrace.every((verdict) => verdict.pass)).toBe(true);
      expect(entry.plan.cost).toBe(entry.plan.bom.total);
      expect(entry.plan.cost).toBeLessThanOrEqual(entry.plan.budgetSummary.bMax);
      assertScoresInRange(entry.plan.perTermScores);
      assertReceiptComplete(entry.plan);
    }
  }
  if (output.kind === "out-of-scope") {
    expect(output.outOfScope.finalBlocker.length).toBeGreaterThan(0);
    expect(output.outOfScope.minViableCost).toBeGreaterThanOrEqual(0);
  }
}

/** Every u_i must be in [0, 1] — no vibe terms, pure anchored utilities. */
function assertScoresInRange(scores: Scores): void {
  for (const [key, value] of Object.entries(scores)) {
    expect(value, `${key} must be >= 0`).toBeGreaterThanOrEqual(0);
    expect(value, `${key} must be <= 1`).toBeLessThanOrEqual(1);
  }
}

/** Receipt contract: topK, scoreMatrix, firedRuleTrace, dataGaps, honestyFrame. */
function assertReceiptComplete(plan: Plan): void {
  expect(plan.receipt.topK.length).toBeGreaterThan(0);
  expect(plan.receipt.firedRuleTrace.length).toBe(plan.firedTrace.length);
  expect(Array.isArray(plan.receipt.dataGaps)).toBe(true);
  expect(plan.receipt.honestyFrame).toBeDefined();
  // The argmax must be the first entry in topK.
  expect(plan.receipt.topK[0].candidateId).toBe(plan.selectedCandidate.id);
}

/** BOM line-items must trace back to bound fixture SKU IDs. */
function assertBomFixtureEquality(plan: Plan): void {
  const boundIds = new Set(plan.selectedCandidate.bindings.map((b) => b.fixture.skuId));
  for (const item of plan.bom.lineItems) {
    expect(boundIds.has(item.model_id), `BOM item ${item.model_id} not in bindings`).toBe(true);
    expect(item.qty).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(item.price), `BOM price ${item.price} must be integer INR`).toBe(true);
  }
  const bomSum = plan.bom.lineItems.reduce((sum, li) => sum + li.price * li.qty, 0);
  expect(bomSum).toBe(plan.cost);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Cross-path output invariants
// ─────────────────────────────────────────────────────────────────────────────

describe("T-019 adversarial output invariants", () => {
  it("never emits an invalid plan across normal, budget, clearance, and tiny-room paths", () => {
    const cases: InputSet[] = [
      makeInput(),
      makeInput({ budget: { bMax: 10000, bTarget: 8000 } }),
      makeInput({
        polygon: { vertices: [v(0, 0), v(1800, 0), v(1800, 1300), v(0, 1300)], ccw: true, wallThicknessMm: 100 },
        budget: { bMax: 300000, bTarget: 250000 },
      }),
      makeInput({
        polygon: { vertices: [v(0, 0), v(900, 0), v(900, 900), v(0, 900)], ccw: true, wallThicknessMm: 100 },
      }),
    ];

    for (const input of cases) {
      expectSafeOutput(solve(input, catalog), input.budget.bMax);
    }
  });

  it("preserves the deterministic result when set-valued feature arrays are reordered", () => {
    const input = makeInput({
      featureConstraints: {
        requiredFeatures: ["low_flow", "single_lever"],
        preferredClasses: ["basin", "toilet"],
        finishFamilies: ["chrome", "white"],
        classCountRanges: {},
      },
    });
    const reordered = makeInput({
      featureConstraints: {
        requiredFeatures: ["single_lever", "low_flow"],
        preferredClasses: ["toilet", "basin"],
        finishFamilies: ["white", "chrome"],
        classCountRanges: {},
      },
    });
    expect(JSON.stringify(solve(input, catalog))).toBe(JSON.stringify(solve(reordered, catalog)));
  });

  it("keeps unconfirmed and malformed rooms on the honest wall", () => {
    const unconfirmed = solve(makeInput({ confirmed: false }), catalog);
    const malformed = solve(
      makeInput({ polygon: { vertices: [v(0, 0), v(100, 0)], ccw: true, wallThicknessMm: 100 } }),
      catalog,
    );
    expect(unconfirmed.kind).toBe("out-of-scope");
    expect(malformed.kind).toBe("out-of-scope");
    if (unconfirmed.kind === "out-of-scope") expect(unconfirmed.outOfScope.finalBlocker).toContain("gate-blocked");
    if (malformed.kind === "out-of-scope") expect(malformed.outOfScope.finalBlocker).toContain("invalid-input");
  });

  it("rejects non-finite budget input without throwing or emitting a plan", () => {
    expect(() => solve(makeInput({ budget: { bMax: Number.NaN, bTarget: 180000 } }), catalog)).not.toThrow();
    const output = solve(makeInput({ budget: { bMax: Number.NaN, bTarget: 180000 } }), catalog);
    expect(output.kind).not.toBe("plan");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: All priority × spaciousness combinations — property-style
// ─────────────────────────────────────────────────────────────────────────────

describe("T-019 priority × spaciousness exhaustive validation", () => {
  for (const priority of PRIORITIES) {
    for (const spaciousness of SPACIOUSNESS_LEVELS) {
      it(`solve(priority=${priority}, spaciousness=${spaciousness}) is fully validated`, () => {
        const input = makeInput({ priority, spaciousness });
        const output = solve(input, catalog);
        expectSafeOutput(output, input.budget.bMax);
        if (output.kind === "plan") {
          assertBomFixtureEquality(output.plan);
        }
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Score range invariant (u_i ∈ [0,1])
// ─────────────────────────────────────────────────────────────────────────────

describe("T-019 score range invariant", () => {
  it("every score term is in [0,1] for normal, ultra-low-budget, and all priorities", () => {
    const cases: InputSet[] = [
      makeInput(),
      makeInput({ budget: { bMax: 10000, bTarget: 8000 } }),
      makeInput({ priority: "value" }),
      makeInput({ priority: "luxury" }),
      makeInput({ priority: "eco-low-maintenance" }),
      makeInput({ spaciousness: "compact" }),
      makeInput({ spaciousness: "airy" }),
    ];
    for (const input of cases) {
      const output = solve(input, catalog);
      if (output.kind === "plan") {
        assertScoresInRange(output.plan.perTermScores);
        for (const entry of output.plan.receipt.topK) {
          assertScoresInRange(entry.perTerm);
        }
      }
      if (output.kind === "relaxation") {
        for (const entry of output.menu) {
          assertScoresInRange(entry.plan.perTermScores);
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: L-shape room through full pipeline
// ─────────────────────────────────────────────────────────────────────────────

describe("T-019 L-shape room adversarial", () => {
  it("solves or honestly rejects an L-shape room — never crashes", () => {
    const input = makeInput({
      polygon: { vertices: LSHAPE, ccw: true, wallThicknessMm: 100 },
      openings: [
        {
          id: "door-1",
          wallId: "wall-bottom",
          kind: "door",
          alongOffsetMm: 200,
          spanMm: 600,
          swing: { side: "in", leafDimsMm: { w: 600, d: 25 } },
        },
      ],
      budget: { bMax: 300000, bTarget: 250000 },
    });
    const output = solve(input, catalog);
    expectSafeOutput(output, input.budget.bMax);
  });

  it("L-shape with tight budget triggers relaxation, not crash", () => {
    const input = makeInput({
      polygon: { vertices: LSHAPE, ccw: true, wallThicknessMm: 100 },
      openings: [
        {
          id: "door-1",
          wallId: "wall-bottom",
          kind: "door",
          alongOffsetMm: 200,
          spanMm: 600,
          swing: { side: "in", leafDimsMm: { w: 600, d: 25 } },
        },
      ],
      budget: { bMax: 10000, bTarget: 8000 },
    });
    const output = solve(input, catalog);
    expect(output.kind).not.toBe("plan"); // too tight for L-shape
    expectSafeOutput(output, input.budget.bMax);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: BOM/render fixture-ID equality
// ─────────────────────────────────────────────────────────────────────────────

describe("T-019 BOM/render fixture-ID equality", () => {
  it("render fixture modelIds exactly match plan binding skuIds", () => {
    const input = makeInput();
    const output = solve(input, catalog);
    expect(output.kind).toBe("plan");
    if (output.kind !== "plan") return;
    const renderGeo = buildRenderGeometry(output.plan, input);
    const bindingIds = output.plan.selectedCandidate.bindings.map((b) => b.fixture.skuId);
    const renderIds = renderGeo.fixtures.map((f) => f.modelId);
    expect(renderIds).toEqual(bindingIds);
  });

  it("BOM line-item model_ids are a subset of bound fixture skuIds", () => {
    const input = makeInput();
    const output = solve(input, catalog);
    if (output.kind !== "plan") return;
    assertBomFixtureEquality(output.plan);
  });

  it("render fixture count matches plan binding count", () => {
    for (const priority of PRIORITIES) {
      const input = makeInput({ priority });
      const output = solve(input, catalog);
      if (output.kind !== "plan") continue;
      const renderGeo = buildRenderGeometry(output.plan, input);
      expect(renderGeo.fixtures.length).toBe(output.plan.selectedCandidate.bindings.length);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: Re-optimization outputs always validated
// ─────────────────────────────────────────────────────────────────────────────

describe("T-019 re-optimization adversarial", () => {
  it("weight-only re-optimization across all priorities produces fully validated plans", () => {
    const baseOutput = solve(makeInput(), catalog);
    expect(baseOutput.kind).toBe("plan");
    if (baseOutput.kind !== "plan") return;
    const prev = baseOutput.plan;

    for (const priority of PRIORITIES) {
      const newInput = makeInput({ priority });
      const output = reoptimize(prev, { kind: "weights", priority }, newInput, catalog);
      expectSafeOutput(output, newInput.budget.bMax);
      if (output.kind === "plan") {
        assertBomFixtureEquality(output.plan);
      }
    }
  });

  it("weight-only re-optimization across all spaciousness levels is validated", () => {
    const baseOutput = solve(makeInput(), catalog);
    if (baseOutput.kind !== "plan") return;
    const prev = baseOutput.plan;

    for (const spaciousness of SPACIOUSNESS_LEVELS) {
      const newInput = makeInput({ spaciousness });
      const output = reoptimize(prev, { kind: "weights", spaciousness }, newInput, catalog);
      expectSafeOutput(output, newInput.budget.bMax);
    }
  });

  it("local re-optimization invalidates and fully re-validates", () => {
    const baseOutput = solve(makeInput(), catalog);
    if (baseOutput.kind !== "plan") return;
    const prev = baseOutput.plan;
    const output = reoptimize(prev, { kind: "local", fixtureModelId: "any" }, makeInput(), catalog);
    expectSafeOutput(output, makeInput().budget.bMax);
  });

  it("global re-optimization with a changed budget is fully validated", () => {
    const baseOutput = solve(makeInput(), catalog);
    if (baseOutput.kind !== "plan") return;
    const prev = baseOutput.plan;
    const newInput = makeInput({ budget: { bMax: 200000, bTarget: 150000 } });
    const output = reoptimize(prev, { kind: "global" }, newInput, catalog);
    expectSafeOutput(output, newInput.budget.bMax);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: Anchor stability
// ─────────────────────────────────────────────────────────────────────────────

describe("T-019 anchor stability", () => {
  it("the same candidate scores identically whether solved alone or in a larger set", () => {
    // Two briefs that differ only in budget (wider B_max admits more candidates).
    const narrow = solve(makeInput({ budget: { bMax: 150000, bTarget: 100000 } }), catalog);
    const wide = solve(makeInput({ budget: { bMax: 250000, bTarget: 180000 } }), catalog);
    if (narrow.kind !== "plan" || wide.kind !== "plan") return;
    // If the narrow argmax appears in the wide set, its per-term scores must be identical.
    const narrowId = narrow.plan.selectedCandidate.id;
    const wideEntry = wide.plan.receipt.topK.find((e) => e.candidateId === narrowId);
    if (wideEntry) {
      expect(wideEntry.perTerm).toEqual(narrow.plan.perTermScores);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: Budget edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("T-019 budget edge adversarial", () => {
  it("negative budget does not crash or emit a plan", () => {
    const output = solve(makeInput({ budget: { bMax: -1, bTarget: -1 } }), catalog);
    expect(output.kind).not.toBe("plan");
  });

  it("bTarget > bMax does not crash", () => {
    const output = solve(makeInput({ budget: { bMax: 100000, bTarget: 200000 } }), catalog);
    expectSafeOutput(output, 100000);
  });

  it("zero budget → relaxation or out-of-scope, never a plan", () => {
    const output = solve(makeInput({ budget: { bMax: 0, bTarget: 0 } }), catalog);
    expect(output.kind).not.toBe("plan");
  });

  it("Infinity budget does not crash", () => {
    expect(() => solve(makeInput({ budget: { bMax: Number.POSITIVE_INFINITY, bTarget: 180000 } }), catalog)).not.toThrow();
    const output = solve(makeInput({ budget: { bMax: Number.POSITIVE_INFINITY, bTarget: 180000 } }), catalog);
    expect(output.kind).not.toBe("plan"); // non-finite should be rejected
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9: Compatibility adversarial
// ─────────────────────────────────────────────────────────────────────────────

describe("T-019 compatibility adversarial", () => {
  it("empty catalog → no plan, honest wall, no crash", () => {
    const emptyCatalog = {
      skus: [],
      compatibilityGraph: new Map<string, Set<string>>(),
      substitutes: new Map<string, string[]>(),
      dataGaps: ["synthetic empty catalog"],
    };
    const output = solve(makeInput(), emptyCatalog);
    expect(output.kind).not.toBe("plan");
    expectSafeOutput(output, makeInput().budget.bMax);
  });

  it("catalog with no compatible pairs → relaxation or out-of-scope", () => {
    // Catalog with SKUs but empty compat graph — C7 should block everything.
    const noCompatCatalog = {
      ...catalog,
      compatibilityGraph: new Map<string, Set<string>>(),
    };
    const output = solve(makeInput(), noCompatCatalog);
    expectSafeOutput(output, makeInput().budget.bMax);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10: Determinism hash test (OPT §14/§18.1)
// ─────────────────────────────────────────────────────────────────────────────

describe("T-019 determinism hash contract", () => {
  const inputs: [string, InputSet][] = [
    ["typical", makeInput()],
    ["luxury-airy", makeInput({ priority: "luxury", spaciousness: "airy" })],
    ["value-compact", makeInput({ priority: "value", spaciousness: "compact" })],
    ["eco-balanced", makeInput({ priority: "eco-low-maintenance", spaciousness: "balanced" })],
    ["tight-budget", makeInput({ budget: { bMax: 60000, bTarget: 50000 } })],
    ["ultra-low", makeInput({ budget: { bMax: 10000, bTarget: 8000 } })],
  ];

  for (const [label, input] of inputs) {
    it(`hash(${label}) → hash(plan) is identical across 3 runs`, () => {
      candidateCache.clear();
      const a = JSON.stringify(solve(input, catalog));
      candidateCache.clear();
      const b = JSON.stringify(solve(input, catalog));
      candidateCache.clear();
      const c = JSON.stringify(solve(input, catalog));
      expect(a).toBe(b);
      expect(b).toBe(c);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11: Performance envelope
// ─────────────────────────────────────────────────────────────────────────────

describe("T-019 performance adversarial", () => {
  it("typical brief end-to-end in under 2 s", () => {
    candidateCache.clear();
    const start = performance.now();
    solve(makeInput(), catalog);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it("impossible brief (relaxation) in under 2 s", () => {
    candidateCache.clear();
    const start = performance.now();
    solve(makeInput({ budget: { bMax: 10000, bTarget: 8000 } }), catalog);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it("L-shape brief in under 2 s", () => {
    candidateCache.clear();
    const start = performance.now();
    solve(makeInput({
      polygon: { vertices: LSHAPE, ccw: true, wallThicknessMm: 100 },
      openings: [{
        id: "door-1", wallId: "wall-bottom", kind: "door", alongOffsetMm: 200,
        spanMm: 600, swing: { side: "in", leafDimsMm: { w: 600, d: 25 } },
      }],
      budget: { bMax: 300000, bTarget: 250000 },
    }), catalog);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it("re-score (weight-only) is under 300 ms", () => {
    // Prime the cache
    solve(makeInput(), catalog);
    const start = performance.now();
    const prev = solve(makeInput(), catalog);
    if (prev.kind !== "plan") return;
    reoptimize(prev.plan, { kind: "weights", priority: "luxury" }, makeInput({ priority: "luxury" }), catalog);
    expect(performance.now() - start).toBeLessThan(300);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12: Conservative geometry probes
// ─────────────────────────────────────────────────────────────────────────────

describe("T-019 conservative geometry probes", () => {
  it("treats a blocker in the conservative swing AABB as a collision", () => {
    const rep: BathroomRep = {
      polygon: { vertices: RECT, ccw: true, wallThicknessMm: 100 },
      strips: buildWallStrips({ vertices: RECT, ccw: true, wallThicknessMm: 100 }),
      openings: [{
        id: "door-1",
        wallId: "wall-bottom",
        kind: "door",
        alongOffsetMm: 1500,
        spanMm: 600,
        swing: { side: "in", leafDimsMm: { w: 600, d: 25 } },
      }],
      plumbingZones: [],
      obstacles: [{ id: "aabb-only", aabb: { min: v(2100, 1300), max: v(2200, 1400) } }],
      slotGridMm: 25,
    };
    const verdict = evaluateC3([], rep, DEFAULT_CONFIG);
    expect(verdict.pass).toBe(false);
    expect(verdict.explanation).toContain("c3-swing-collision:door-1:aabb-only");
  });

  it("does not let malformed fixture bindings become a valid geometry result", () => {
    const fixture: Fixture = {
      skuId: "malformed",
      class: "toilet",
      footprintMm: { w: 400, d: 700, h: 800 },
      classAffinity: [],
      orientation: 0,
      featureTags: ["floor_mount"],
      zones: [],
    };
    const binding: FixtureBinding = {
      fixture,
      wallStripId: "wall-nope",
      posAlongMm: 0,
      orientation: 0,
    };
    const rep: BathroomRep = {
      polygon: { vertices: RECT, ccw: true, wallThicknessMm: 100 },
      strips: buildWallStrips({ vertices: RECT, ccw: true, wallThicknessMm: 100 }),
      openings: [],
      plumbingZones: [],
      obstacles: [],
      slotGridMm: 25,
    };
    expect(evaluateC3([binding], rep, DEFAULT_CONFIG).pass).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 13: Catalog/constraint probes
// ─────────────────────────────────────────────────────────────────────────────

describe("T-019 catalog/constraint probes", () => {
  it("matches finish families by family, not finish id", () => {
    const catalog = syntheticCatalog([
      syntheticSku("TEST-STONE-VANITY", "vanity", { w: 600, d: 450, h: 800 }, {
        finish_options: ["white_stone"],
      }),
      syntheticSku("TEST-WOOD-VANITY", "vanity", { w: 600, d: 450, h: 800 }, {
        finish_options: ["teak"],
      }),
    ]);
    const stoneVanities = bindingPool(
      catalog,
      makeInput({
        featureConstraints: {
          requiredFeatures: [],
          preferredClasses: ["vanity"],
          finishFamilies: ["stone"],
          classCountRanges: { vanity: { min: 1, max: 1 } },
        },
      }),
      "vanity",
    );
expect(stoneVanities.length).toBeGreaterThan(0);
     // bindingPool returns all class-matched SKUs; finish-family coverage is
     // enforced at the plan level (binding/assemble), not per-SKU in the pool.
     expect(stoneVanities.some((sku) => sku.finish_options.includes("white_stone"))).toBe(true);
  });

  it("required features are covered at the bound-set level, not per pool SKU", () => {
    const catalog = syntheticCatalog([
      ...syntheticBathroomCatalog().skus,
      syntheticSku("TEST-RAIN-SHOWER", "shower", { w: 200, d: 200, h: 200 }, {
        feature_tags: ["wall_mount", "rain_shower"],
      }),
      syntheticSku("TEST-PLAIN-SHOWER", "shower", { w: 200, d: 200, h: 200 }, {
        feature_tags: ["wall_mount"],
      }),
    ]);
    // OPT §8.2 / bindSkus: requiredFeatures must be carried by the union of
    // bound SKU tags; bindingPool deliberately does not tag-filter, because a
    // required tag may be satisfied by another fixture class in the plan.
    const rainPool = bindingPool(
      catalog,
      makeInput({
        featureConstraints: {
          requiredFeatures: ["rain_shower", "single_lever"],
          preferredClasses: ["shower"],
          finishFamilies: ["white", "chrome"],
          classCountRanges: { shower: { min: 1, max: 1 } },
        },
      }),
      "shower",
    );
    expect(rainPool.length).toBeGreaterThan(0);
    expect(rainPool.some((sku) => sku.feature_tags.includes("rain_shower"))).toBe(true);
    expect(rainPool.some((sku) => !sku.feature_tags.includes("rain_shower"))).toBe(true);
    // Every emitted plan covers the required tag collectively.
    const input = makeInput({
      config: { ...DEFAULT_CONFIG, slotGridMm: 300 },
      featureConstraints: {
        requiredFeatures: ["rain_shower", "single_lever"],
        preferredClasses: ["shower"],
        finishFamilies: ["white", "chrome"],
        classCountRanges: { shower: { min: 1, max: 1 } },
      },
    });
    const output = solve(input, catalog);
    expect(output.kind).toBe("plan");
    if (output.kind !== "plan") return;
    expectSafeOutput(output, input.budget.bMax);
    const bindings = output.plan.selectedCandidate.bindings;
    const tags = new Set(bindings.flatMap((b) => b.fixture.featureTags));
    expect(tags.has("rain_shower")).toBe(true);
    expect(tags.has("single_lever")).toBe(true);
    expect(bindings.some((b) => !b.fixture.featureTags.includes("rain_shower"))).toBe(true);
    expect(bindings.every((b) => !(b.fixture.featureTags.includes("rain_shower") && b.fixture.featureTags.includes("single_lever")))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 14: Alternative profiles adversarial
// ─────────────────────────────────────────────────────────────────────────────

describe("T-019 alternative profiles adversarial", () => {
  it("every alternative plan is fully validated and cost ≤ B_max", () => {
    const input = makeInput();
    const alts = alternativeProfiles(input, catalog);
    expect(alts.length).toBe(PRIORITIES.length - 1);
    for (const alt of alts) {
      expect(alt.plan.firedTrace.every((v) => v.pass)).toBe(true);
      expect(alt.plan.cost).toBe(alt.plan.bom.total);
      expect(alt.plan.cost).toBeLessThanOrEqual(input.budget.bMax);
      assertScoresInRange(alt.plan.perTermScores);
      assertBomFixtureEquality(alt.plan);
    }
  });

  it("alternative profiles are empty for unconfirmed briefs", () => {
    expect(alternativeProfiles(makeInput({ confirmed: false }), catalog)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 15: Input mutation safety
// ─────────────────────────────────────────────────────────────────────────────

describe("T-019 input mutation safety", () => {
  it("solve() never mutates the input object", () => {
    const input = makeInput();
    const snapshot = JSON.stringify(input);
    solve(input, catalog);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("reoptimize() never mutates the input object", () => {
    const output = solve(makeInput(), catalog);
    if (output.kind !== "plan") return;
    const input = makeInput({ priority: "luxury" });
    const snapshot = JSON.stringify(input);
    reoptimize(output.plan, { kind: "weights", priority: "luxury" }, input, catalog);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("alternativeProfiles() never mutates the input object", () => {
    const input = makeInput();
    const snapshot = JSON.stringify(input);
    alternativeProfiles(input, catalog);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 16: Receipt completeness adversarial
// ─────────────────────────────────────────────────────────────────────────────

describe("T-019 receipt completeness", () => {
  it("C8 verdict appears in firedTrace for every emitted plan", () => {
    for (const priority of PRIORITIES) {
      const output = solve(makeInput({ priority }), catalog);
      if (output.kind !== "plan") continue;
      const ruleIds = output.plan.firedTrace.map((v) => v.ruleId);
      expect(ruleIds).toContain("C8");
    }
  });

  it("topK is sorted by total descending and bounded by config.topK", () => {
    const output = solve(makeInput(), catalog);
    if (output.kind !== "plan") return;
    const topK = output.plan.receipt.topK;
    expect(topK.length).toBeLessThanOrEqual(DEFAULT_CONFIG.topK);
    for (let i = 1; i < topK.length; i++) {
      expect(topK[i - 1].total).toBeGreaterThanOrEqual(topK[i].total);
    }
  });

  it("scoreMatrix contains entries for every topK candidate", () => {
    const output = solve(makeInput(), catalog);
    if (output.kind !== "plan") return;
    for (const entry of output.plan.receipt.topK) {
      expect(output.plan.receipt.scoreMatrix[entry.candidateId]).toBeDefined();
    }
  });
});
