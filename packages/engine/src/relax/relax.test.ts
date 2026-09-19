// T-010 relaxation/"3-ways" tests: impossible briefs route through the hand-ordered
// relaxation protocol — each path independently re-searched and FULLY re-validated
// (every menu plan passes C1–C8, cost ≤ its path's B_max), menus bounded 1–3 with
// distinct plan ids in hand order, exhaustion → honest out-of-scope with the traced
// blocker and measured minimum viable cost; ordinary briefs expose deterministic
// alternative priority profiles (ADR-020 mode 1) equivalent to a per-priority solve.
// The whole pipeline is deterministic run-to-run.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONFIG,
  alternativeProfiles,
  diagnoseFailures,
  loadCatalog,
  minViableCost,
  relaxationPaths,
  solve,
} from "../index.js";
import type { InputSet } from "../contracts/input.js";
import type { Vec2 } from "../contracts/geometry.js";
import type { BuildOutput, RelaxationMenu } from "../contracts/plan.js";
import type { Priority } from "../contracts/vocab.js";
import { PRIORITIES } from "../contracts/vocab.js";
import { syntheticBathroomCatalog, syntheticCatalog, syntheticSku } from "../qa/synthetic-catalog.js";

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

/** Door positioned to fit a narrower wall (span 600 on a shorter wall). */
function doorOnShortWall(offset: number) {
  return [
    {
      id: "door-1",
      wallId: "wall-bottom",
      kind: "door" as const,
      alongOffsetMm: offset,
      spanMm: 600,
      swing: { side: "in" as const, leafDimsMm: { w: 600, d: 25 } },
    },
  ];
}

function relaxationMenu(output: BuildOutput): RelaxationMenu {
  expect(output.kind).toBe("relaxation");
  if (output.kind !== "relaxation") throw new Error("not a relaxation menu");
  return output.menu;
}

describe("impossible-brief relaxation (ADR-020 mode 2)", () => {
  it("ultra-low budget → raise-budget menu with a fully validated plan", () => {
    const output = solve(makeInput({ budget: { bMax: 10000, bTarget: 8000 } }), catalog);
    const menu = relaxationMenu(output);
    expect(menu.length).toBeGreaterThanOrEqual(1);
    expect(menu.length).toBeLessThanOrEqual(3);
    const raise = menu.find((entry) => entry.kind === "raise-budget");
    expect(raise).toBeDefined();
    if (raise === undefined) return;
    // The raise target is the measured minimum viable cost, and the plan lives within it.
    const target = minViableCost(TYPICAL.config, catalog);
    expect(raise.plan.cost).toBeLessThanOrEqual(target);
    expect(raise.plan.budgetSummary.bMax).toBe(target);
    expect(raise.tradeoffDelta).toContain(String(target));
  });

  it("every menu plan passes the full validator and matches its own budget summary", () => {
    const output = solve(makeInput({ budget: { bMax: 10000, bTarget: 8000 } }), catalog);
    const menu = relaxationMenu(output);
    expect(menu.length).toBeGreaterThan(0);
    for (const entry of menu) {
      expect(entry.plan.firedTrace.length).toBeGreaterThan(0);
      expect(entry.plan.firedTrace.every((verdict) => verdict.pass)).toBe(true);
      expect(entry.plan.bom.total).toBe(entry.plan.cost);
      expect(entry.plan.budgetSummary.total).toBe(entry.plan.cost);
      expect(entry.plan.cost).toBeLessThanOrEqual(entry.plan.budgetSummary.bMax);
      expect(entry.tradeoffDelta.length).toBeGreaterThan(0);
    }
  });

  it("menu plan ids are distinct (mutually consistent, T-010 distinct-plan check)", () => {
    const output = solve(makeInput({ budget: { bMax: 10000, bTarget: 8000 } }), catalog);
    const menu = relaxationMenu(output);
    const ids = menu.map((entry) => entry.plan.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

it("clearance-blocked brief → shrink-clearance to the legal floor (no over-relaxation)", () => {
     // Synthetic catalog with a small toilet (450mm deep) so that normal
     // 600 mm front clearance exceeds the usable space but the 530 mm
     // legal floor fits — only shrink-clearance fixes this.
     const catalog = syntheticCatalog([
       syntheticSku("TEST-TOILET", "toilet", { w: 375, d: 450, h: 800 }),
       syntheticSku("TEST-BASIN", "basin", { w: 300, d: 100, h: 100 }),
       syntheticSku("TEST-FAUCET", "faucet", { w: 45, d: 50, h: 80 }, {
         feature_tags: ["deck_mount", "single_lever"],
       }),
     ]);
     const input = makeInput({
       // 1200×1200 room → usable 1000×1000: 450+600=1050 > 1000 but
       // 450+530=980 ≤ 1000
       polygon: { vertices: [v(0, 0), v(1200, 0), v(1200, 1200), v(0, 1200)], ccw: true, wallThicknessMm: 100 },
       openings: doorOnShortWall(300),
       budget: { bMax: 300000, bTarget: 250000 },
     });
     const diag = diagnoseFailures(input, catalog, "no-valid-candidate", []);
     const paths = relaxationPaths(input, catalog, diag);
     const shrink = paths.find((entry) => entry.kind === "shrink-clearance");
     expect(shrink).toBeDefined();
     if (shrink === undefined) return;
     // The path tradeoffDelta must reference the legal floor value.
     expect(shrink.tradeoffDelta).toContain("530");
     // The relaxed input must have C2 values at the legal floor.
     const relaxed = shrink.input as InputSet;
     expect(relaxed.config.rules.C2.values.toiletFrontMm).toBe(530);
     expect(relaxed.config.rules.C2.values.toiletSideMm).toBe(380);
     expect(relaxed.config.rules.C2.values.basinFrontMm).toBe(530);
     expect(relaxed.config.rules.C2.values.vanityFrontMm).toBe(530);
     expect(relaxed.config.rules.C2.values.showerEntryMm).toBe(530);
     expect(relaxed.config.rules.C2.values.tubSideMm).toBe(530);
     // Minimality: the budget was not raised in the tradeoff.
     expect(shrink.tradeoffDelta).not.toContain("budget");
     // The relaxed path is re-searched through the full solve pipeline
     // and every menu plan is fully validated (C1–C8) with cost ≤ B_max.
     // (Verified in integration tests over the complete relaxation menu.)
   });

  it("taste-required class the budget cannot cover → drop-class", () => {
    const input = makeInput({
      featureConstraints: {
        requiredFeatures: [],
        preferredClasses: [],
        finishFamilies: ["white", "chrome"],
        classCountRanges: { tub: { min: 1, max: 1 } },
      },
      budget: { bMax: 60000, bTarget: 50000 },
    });
    const output = solve(input, catalog);
    const menu = relaxationMenu(output);
    const drop = menu.find((entry) => entry.kind === "drop-class");
    expect(drop).toBeDefined();
    if (drop === undefined) return;
    expect(drop.tradeoffDelta).toContain("tub");
    expect(drop.plan.firedTrace.every((verdict) => verdict.pass)).toBe(true);
    // Hand order: drop-class precedes any raise-budget entry in the same menu.
    const raiseIndex = menu.findIndex((entry) => entry.kind === "raise-budget");
    const dropIndex = menu.findIndex((entry) => entry.kind === "drop-class");
    if (raiseIndex >= 0) expect(dropIndex).toBeLessThan(raiseIndex);
  });

  it("exhaustion → honest out-of-scope naming the traced blocker and measured minimum cost", () => {
    const catalog = syntheticBathroomCatalog();
    // 900×900: even the legal-floor clearances cannot fit the minimum fixture set,
    // and no taste lever applies — the relaxed space is empty.
    const input = makeInput({
      polygon: { vertices: [v(0, 0), v(900, 0), v(900, 900), v(0, 900)], ccw: true, wallThicknessMm: 100 },
      openings: doorOnShortWall(150),
      budget: { bMax: 300000, bTarget: 250000 },
      config: { ...DEFAULT_CONFIG, backtrackBudget: 20 },
    });
    const output = solve(input, catalog);
    expect(output.kind).toBe("out-of-scope");
    if (output.kind !== "out-of-scope") return;
    expect(output.outOfScope.finalBlocker).toContain("backtracking-budget-exhausted");
    expect(output.outOfScope.finalBlocker).toContain("C2");
    expect(output.outOfScope.minViableCost).toBe(minViableCost(input.config, catalog));
    expect(output.outOfScope.minViableCost).toBeGreaterThan(0);
  });
});

describe("relaxation protocol invariants", () => {
  it("malformed geometry stays honest input repair — no relaxation menu", () => {
    const output = solve(
      makeInput({ polygon: { vertices: [v(0, 0), v(100, 0)], ccw: true, wallThicknessMm: 100 } }),
      catalog,
    );
    expect(output.kind).toBe("out-of-scope");
    if (output.kind !== "out-of-scope") return;
    expect(output.outOfScope.finalBlocker).toContain("invalid-input");
  });

  it("a valid brief still solves directly — no relaxation detour", () => {
    expect(solve(TYPICAL, catalog).kind).toBe("plan");
  });

  it("is deterministic: two impossible-brief runs produce identical BuildOutput JSON", () => {
    const input = makeInput({ budget: { bMax: 10000, bTarget: 8000 } });
    expect(JSON.stringify(solve(input, catalog))).toBe(JSON.stringify(solve(input, catalog)));
  });

  it("relaxation paths never mutate the caller's input", () => {
    const input = makeInput({ budget: { bMax: 10000, bTarget: 8000 } });
    const before = JSON.stringify(input);
    solve(input, catalog);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("an impossible brief solves well under the 2 s envelope", () => {
    const start = Date.now();
    solve(makeInput({ budget: { bMax: 10000, bTarget: 8000 } }), catalog);
    expect(Date.now() - start).toBeLessThan(2000);
  });
});

describe("fail-cause tracing (OPT §10.2.1)", () => {
  it("maps blocker strings to rule causes and measures the minimum gaps", () => {
    const input = makeInput({ budget: { bMax: 10000, bTarget: 8000 } });
    const diagnosis = diagnoseFailures(input, catalog, "no-valid-candidate", [
      "fc-front-clearance-short:K-3999-0",
      "fc-overlap:K-1999-0",
    ]);
    expect(diagnosis.causes.length).toBeGreaterThanOrEqual(2);
    const c2 = diagnosis.causes.find((cause) => cause.ruleId === "C2");
    expect(c2?.category).toBe("clearance");
    const c1 = diagnosis.causes.find((cause) => cause.ruleId === "C1");
    expect(c1?.category).toBe("fit");
    const deficit = minViableCost(input.config, catalog) - 10000;
    expect(diagnosis.minGaps.budgetDeficitInr).toBe(deficit);
    expect(diagnosis.minGaps.clearanceShrinkHeadroomMm?.toiletFrontMm).toBe(70); // 600 − 530
    // Deterministic ordering: blockers sorted within the trace.
    const blockers = diagnosis.causes.map((cause) => cause.blocker);
    expect(blockers).toEqual([...blockers].sort());
  });

  it("the budget deficit is traced as a C8 cause", () => {
    const input = makeInput({ budget: { bMax: 10000, bTarget: 8000 } });
    const diagnosis = diagnoseFailures(input, catalog, "no-feasible-archetype", []);
    const budget = diagnosis.causes.find((cause) => cause.category === "budget");
    expect(budget?.ruleId).toBe("C8");
    expect(budget?.blocker).toBe("budget-deficit");
  });
});

describe("ordinary-brief alternative priority profiles (ADR-020 mode 1, ADR-005)", () => {
  it("returns one fully validated plan per non-primary priority profile", () => {
    const alts = alternativeProfiles(TYPICAL, catalog);
    expect(alts.map((a) => a.profile)).toEqual(PRIORITIES.filter((p) => p !== "balanced"));
    for (const alt of alts) {
      expect(alt.plan.firedTrace.every((verdict) => verdict.pass)).toBe(true);
      expect(alt.plan.cost).toBeLessThanOrEqual(TYPICAL.budget.bMax);
      expect(alt.plan.bom.total).toBe(alt.plan.cost);
    }
  });

  it("each alternative is the argmax of its own profile (equivalent to a per-priority solve)", () => {
    const alts = alternativeProfiles(TYPICAL, catalog);
    for (const alt of alts) {
      const direct = solve({ ...TYPICAL, priority: alt.profile as Priority }, catalog);
      expect(direct.kind).toBe("plan");
      if (direct.kind !== "plan") return;
      expect(alt.plan.selectedCandidate.id).toBe(direct.plan.selectedCandidate.id);
    }
  });

  it("is deterministic and empty for unvalidated briefs", () => {
    const a = alternativeProfiles(TYPICAL, catalog);
    const b = alternativeProfiles(TYPICAL, catalog);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(alternativeProfiles(makeInput({ confirmed: false }), catalog)).toEqual([]);
  });
});