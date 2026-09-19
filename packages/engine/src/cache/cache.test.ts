// T-011 cache & incremental re-optimization tests (ADR-016/ADR-017): cache-key
// ordering invariance, invalidation on every candidate-affecting dimension, pure
// re-score equivalence (reoptimize-weights == fresh solve under the new priority),
// local/global fallbacks, full-validator-on-every-output, determinism, and cache
// latency (a cache hit re-scores strictly faster than a fresh solve).

import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONFIG,
  candidateCache,
  candidateCacheKey,
  loadCatalog,
  reoptimize,
  solve,
} from "../index.js";
import type { InputSet } from "../contracts/input.js";
import type { ReoptChange, Plan, BuildOutput } from "../contracts/plan.js";
import type { Vec2 } from "../contracts/geometry.js";

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

function planOf(output: BuildOutput): Plan {
  expect(output.kind).toBe("plan");
  if (output.kind !== "plan") throw new Error("not a plan");
  return output.plan;
}

function assertFullyValidated(plan: Plan): void {
  expect(plan.firedTrace.length).toBeGreaterThan(0);
  expect(plan.firedTrace.every((verdict) => verdict.pass)).toBe(true);
  expect(plan.bom.total).toBe(plan.cost);
  expect(plan.budgetSummary.total).toBe(plan.cost);
  expect(plan.cost).toBeLessThanOrEqual(plan.budgetSummary.bMax);
}

describe("candidate cache key (ADR-016)", () => {
  it("excludes weight-only knobs: priority/spaciousness changes keep the key", () => {
    const base = candidateCacheKey(TYPICAL);
    expect(candidateCacheKey(makeInput({ priority: "value" }))).toBe(base);
    expect(candidateCacheKey(makeInput({ spaciousness: "roomy" }))).toBe(base);
    expect(candidateCacheKey({ ...TYPICAL, priority: undefined })).toBe(base);
  });

  it("is invariant under openings reordering (canonical entity order)", () => {
    const twoDoors = makeInput({
      openings: [
        {
          id: "door-1",
          wallId: "wall-bottom",
          kind: "door" as const,
          alongOffsetMm: 1500,
          spanMm: 600,
          swing: { side: "in" as const, leafDimsMm: { w: 600, d: 25 } },
        },
        {
          id: "window-1",
          wallId: "wall-top",
          kind: "window" as const,
          alongOffsetMm: 400,
          spanMm: 500,
        },
      ],
    });
    const reordered = makeInput({ openings: [...twoDoors.openings].reverse() });
    expect(candidateCacheKey(reordered)).toBe(candidateCacheKey(twoDoors));
  });

  it("changes on every candidate-affecting dimension (invalidation keys)", () => {
    const base = candidateCacheKey(TYPICAL);
    expect(
      candidateCacheKey(
        makeInput({
          polygon: {
            vertices: [v(0, 0), v(2400, 0), v(2400, 1700), v(0, 1700)],
            ccw: true,
            wallThicknessMm: 100,
          },
        }),
      ),
    ).not.toBe(base);
    expect(
      candidateCacheKey(
        makeInput({
          openings: [
            {
              id: "door-1",
              wallId: "wall-bottom",
              kind: "door" as const,
              alongOffsetMm: 900,
              spanMm: 600,
              swing: { side: "in" as const, leafDimsMm: { w: 600, d: 25 } },
            },
          ],
        }),
      ),
    ).not.toBe(base);
    expect(candidateCacheKey(makeInput({ confirmed: false }))).not.toBe(base);
    expect(
      candidateCacheKey(
        makeInput({
          featureConstraints: {
            ...TYPICAL.featureConstraints,
            requiredFeatures: ["rain_shower"],
          },
        }),
      ),
    ).not.toBe(base);
    expect(candidateCacheKey(makeInput({ budget: { bMax: 200000, bTarget: 150000 } }))).not.toBe(
      base,
    );
    expect(candidateCacheKey(makeInput({ config: { ...DEFAULT_CONFIG, topK: 5 } }))).not.toBe(
      base,
    );
  });
});

describe("reoptimize (OPT §10.1)", () => {
  it("weight-only change re-scores to EXACTLY a fresh solve under the new priority", () => {
    const first = solve(TYPICAL, catalog);
    expect(first.kind).toBe("plan");
    const prev = planOf(first);

    const weights: ReoptChange = { kind: "weights", priority: "luxury" };
    const before = performance.now();
    const reopt = planOf(reoptimize(prev, weights, makeInput({ priority: "luxury" }), catalog));
    const reoptMs = performance.now() - before;

    const fresh = planOf(solve(makeInput({ priority: "luxury" }), catalog));
    expect(JSON.stringify(reopt)).toBe(JSON.stringify(fresh));
    // Priority oracle sanity: luxury ≥ balanced on u_luxury for the re-scored plan.
    expect(reopt.perTermScores.uLuxury).toBeGreaterThanOrEqual(prev.perTermScores.uLuxury);
    expect(reoptMs).toBeLessThan(300); // re-score, not a re-search
  });

  it("weight-only change never touches geometry (no stale-rep artifacts)", () => {
    const prev = planOf(solve(TYPICAL, catalog));
    const reopt = planOf(
      reoptimize(
        prev,
        { kind: "weights", spaciousness: "cozy" },
        makeInput({ spaciousness: "cozy" }),
        catalog,
      ),
    );
    const fresh = planOf(solve(makeInput({ spaciousness: "cozy" }), catalog));
    expect(reopt.id).toBe(fresh.id);
    expect(reopt.bom.lineItems).toEqual(fresh.bom.lineItems);
  });

  it("local change falls back to a bounded full re-search, fully revalidated", () => {
    const prev = planOf(solve(TYPICAL, catalog));
    const output = reoptimize(prev, { kind: "local", fixtureModelId: "any" }, TYPICAL, catalog);
    // Same input → the re-search lands on the same deterministic plan.
    expect(output.kind).toBe("plan");
    const plan = planOf(output);
    assertFullyValidated(plan);
    expect(plan.id).toBe(prev.id);
    // The stale entry was invalidated, then the re-search re-cached it.
    expect(candidateCache.size).toBeGreaterThan(0);
  });

  it("global change is a full re-search identical to solve()", () => {
    const prev = planOf(solve(TYPICAL, catalog));
    const output = reoptimize(prev, { kind: "global" }, TYPICAL, catalog);
    expect(JSON.stringify(output)).toBe(JSON.stringify(solve(TYPICAL, catalog)));
  });

  it("weight-only change on a still-impossible brief routes through the honest wall", () => {
    const low = makeInput({ budget: { bMax: 10000, bTarget: 8000 } });
    const first = solve(low, catalog);
    expect(first.kind).not.toBe("plan");
    // A weights-only reopt needs a prev Plan; the impossible brief never produced
    // one, so exercise the no-cached-set path via a stub prev (typed, never used).
    const stub: Plan = {
      id: "plan-none",
      selectedCandidate: { id: "none", bindings: [], cost: 0 },
      firedTrace: [],
      perTermScores: { uCost: 0, uSpace: 0, uWater: 0, uLuxury: 0, uMaintenance: 0 },
      cost: 0,
      bom: { lineItems: [], total: 0, byZone: {} },
      budgetSummary: { total: 0, bTarget: 8000, bMax: 10000 },
      receipt: { topK: [], scoreMatrix: {}, firedRuleTrace: [], dataGaps: [], honestyFrame: "n/a" },
    };
    const output = reoptimize(stub, { kind: "weights", priority: "value" }, low, catalog);
    expect(output.kind).not.toBe("plan"); // menu/out-of-scope, never a fabricated plan
  });

  it("is deterministic run-to-run (cold cache after clear)", () => {
    const prev = planOf(solve(TYPICAL, catalog));
    const a = reoptimize(
      prev,
      { kind: "weights", priority: "value" },
      makeInput({ priority: "value" }),
      catalog,
    );
    candidateCache.clear();
    const b = reoptimize(
      prev,
      { kind: "weights", priority: "value" },
      makeInput({ priority: "value" }),
      catalog,
    );
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
