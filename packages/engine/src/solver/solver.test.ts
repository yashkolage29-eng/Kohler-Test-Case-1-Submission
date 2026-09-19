// T-008 constructive-solver tests: a typical confirmed InputSet over the real
// demo catalog produces validated candidates; emitted candidates always pass
// full validation (C1–C6 + C7 + arithmetic budget); unconfirmed input is
// gate-blocked; budget exhaustion returns a typed infeasibility; the whole
// pipeline is deterministic run-to-run; and a typical room solves under 2 s.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONFIG,
  loadCatalog,
  runConstructiveSolver,
} from "../index.js";
import type { InputSet } from "../contracts/input.js";
import type { Candidate } from "../contracts/candidate.js";
import type { Vec2 } from "../contracts/geometry.js";
import { evaluateGeometryRules } from "../geometry/rules/index.js";
import { evaluateC7, c7FeatureSet } from "../rules/c7_compat.js";
import { buildBathroomRep } from "../geometry/room.js";
import { assembleCandidate } from "./assemble.js";

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

function fullValidationPasses(input: InputSet, candidate: Candidate): boolean {
  const rep = buildBathroomRep(input);
  if (!rep.ok) return false;
  const geo = evaluateGeometryRules(candidate.bindings, rep.rep, input.config);
  const c7 = evaluateC7(
    candidate.bindings,
    catalog,
    c7FeatureSet(input.featureConstraints),
    input.config,
  );
  return geo.every((r) => r.pass) && c7.pass && candidate.cost <= input.budget.bMax;
}

describe("runConstructiveSolver — typical confirmed room", () => {
  it("produces at least one valid candidate", () => {
    const result = runConstructiveSolver(TYPICAL, catalog);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
  });

  it("emits only candidates that pass full validation (measured, re-checked)", () => {
    const result = runConstructiveSolver(TYPICAL, catalog);
    if (result.kind !== "ok") return; // covered by the ≥1 test above
    for (const candidate of result.candidates) {
      expect(candidate.geometryValid).toBe(true);
      expect(candidate.compatOk).toBe(true);
      expect(candidate.cost).toBeLessThanOrEqual(TYPICAL.budget.bMax);
      expect(fullValidationPasses(TYPICAL, candidate)).toBe(true);
    }
  });

  it("is deterministic: two runs produce identical candidate lists", () => {
    const a = runConstructiveSolver(TYPICAL, catalog);
    const b = runConstructiveSolver(TYPICAL, catalog);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("solves a typical room in under 2 s", () => {
    const start = performance.now();
    runConstructiveSolver(TYPICAL, catalog);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("runConstructiveSolver — gates and infeasibility", () => {
  it("blocks on unconfirmed input with a typed gate result", () => {
    const result = runConstructiveSolver(makeInput({ confirmed: false }), catalog);
    expect(result.kind).toBe("gate-blocked");
    if (result.kind !== "gate-blocked") return;
    expect(result.reasons).toContain("input-not-confirmed");
  });

  it("returns a typed infeasibility (never hangs) when the budget cannot bind any archetype", () => {
    const result = runConstructiveSolver(
      makeInput({ budget: { bMax: 10000, bTarget: 8000 } }),
      catalog,
    );
    expect(result.kind).toBe("infeasible");
    if (result.kind !== "infeasible") return;
    expect(result.reason).toBe("no-feasible-archetype");
    expect(Array.isArray(result.blockers)).toBe(true);
  });

  it("is deterministic on infeasibility too", () => {
    const input = makeInput({ budget: { bMax: 10000, bTarget: 8000 } });
    expect(JSON.stringify(runConstructiveSolver(input, catalog))).toBe(
      JSON.stringify(runConstructiveSolver(input, catalog)),
    );
  });
});

describe("assembleCandidate — hard gates", () => {
  it("rejects a binding whose cost exceeds the budget ceiling", () => {
    const rep = buildBathroomRep(TYPICAL);
    expect(rep.ok).toBe(true);
    if (!rep.ok) return;
    const sku = catalog.skus[0];
    const fixture = {
      skuId: sku.model_id,
      class: sku.fixture_class,
      footprintMm: { w: sku.dim.w, d: sku.dim.d, h: sku.dim.h },
      classAffinity: [],
      orientation: 0,
      featureTags: sku.feature_tags,
      zones: [],
    };
    const candidate = assembleCandidate(
      [{ fixture, wallStripId: "wall-bottom", posAlongMm: 0, orientation: 0 }],
      makeInput({ budget: { bMax: 0, bTarget: 0 } }),
      catalog,
      rep.rep,
    );
    expect(candidate).toBeNull();
  });
});
