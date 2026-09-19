/**
 * T-021 demo acceptance rehearsal — scripted typical brief and impossible brief,
 * determinism + latency evidence. Run: `node scripts/rehearse.mjs` after `npm run build`.
 */
import { loadCatalog, solve, reoptimize, DEFAULT_CONFIG } from "../packages/engine/dist/index.js";

const catalog = loadCatalog().state;
const v = (x, y) => ({ x, y });
const rect = (w, d) => [v(0, 0), v(w, 0), v(w, d), v(0, d)];

function brief(overrides = {}) {
  const w = overrides.polygon ? overrides.polygon.vertices[1].x : 2400;
  const alongOffsetMm = Math.max(100, Math.floor(w / 2) - 300);
  return {
    polygon: { vertices: rect(2400, 1800), ccw: true, wallThicknessMm: 100 },
    openings: [
      {
        id: "door-1",
        wallId: "wall-bottom",
        kind: "door",
        alongOffsetMm,
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

const out = {};
const ms = (fn) => {
  const t0 = performance.now();
  const r = fn();
  return { r, dt: Math.round(performance.now() - t0) };
};

// ---- Scenario A: scripted typical brief ----
const typical = brief();
const a1 = ms(() => solve(typical, catalog));
const a2 = ms(() => solve(typical, catalog));
out.typical = {
  kind: a1.r.kind,
  ms: a1.dt,
  msRepeat: a2.dt,
  deterministic:
    a1.r.kind === "plan" && a2.r.kind === "plan"
      ? a1.r.plan.id === a2.r.plan.id &&
        a1.r.plan.cost === a2.r.plan.cost &&
        JSON.stringify(a1.r.plan.bom) === JSON.stringify(a2.r.plan.bom)
      : JSON.stringify(a1.r) === JSON.stringify(a2.r),
  cost: a1.r.kind === "plan" ? a1.r.plan.cost : null,
  fixtures: a1.r.kind === "plan" ? a1.r.plan.selectedCandidate.bindings.length : null,
  bomLines: a1.r.kind === "plan" ? a1.r.plan.bom.lineItems.length : null,
  withinBudget: a1.r.kind === "plan" ? a1.r.plan.cost <= typical.budget.bMax : null,
};

// ---- Scenario A2: steer (priority re-roll) ----
if (out.typical.kind === "plan") {
  const r = ms(() =>
    reoptimize(a1.r.plan, { kind: "weights", priority: "luxury" }, typical, catalog),
  );
  out.steer = {
    kind: r.r.kind,
    ms: r.dt,
    cost: r.r.kind === "plan" ? r.r.plan.cost : null,
    valid: r.r.kind === "plan",
  };
}

// ---- Scenario B1: recoverable impossible brief (UI-reachable: "add a tub" in a
// compact room on a meager budget) → relaxation menu of validated ways that DO fit.
const impossible = brief({
  budget: { bMax: 90000, bTarget: 72000 },
  featureConstraints: {
    requiredFeatures: [],
    preferredClasses: [],
    finishFamilies: ["white", "chrome"],
    classCountRanges: { tub: { min: 1, max: 1 } },
  },
});
const b1 = ms(() => solve(impossible, catalog));
out.impossibleAddTub = {
  kind: b1.r.kind,
  ms: b1.dt,
  menuSize: b1.r.kind === "relaxation" ? b1.r.menu.length : 0,
  menuKinds: b1.r.kind === "relaxation" ? b1.r.menu.map((m) => m.kind) : null,
  menuCosts: b1.r.kind === "relaxation" ? b1.r.menu.map((m) => m.plan.cost) : null,
  distinctPlans:
    b1.r.kind === "relaxation" ? new Set(b1.r.menu.map((m) => m.plan.id)).size : null,
  outOfScope: b1.r.kind === "out-of-scope" ? b1.r.outOfScope : null,
  noFakePlan: b1.r.kind !== "plan",
};

// Relaxation selection must itself produce a validated plan.
if (b1.r.kind === "relaxation") {
  const p = b1.r.menu[0].plan;
  out.relaxedPlan = {
    id: p.id,
    cost: p.cost,
    fixtures: p.selectedCandidate.bindings.length,
    withinBudget: p.cost <= p.budgetSummary.bMax,
  };
}

// ---- Scenario B2: taste-blocked brief (finish taste the catalog cannot satisfy in
// this room) → swap-sku recovery path (UI-reachable via the AI taste read).
const tasteBlocked = brief({
  budget: { bMax: 150000, bTarget: 120000 },
  featureConstraints: {
    requiredFeatures: [],
    preferredClasses: [],
    finishFamilies: ["stone"],
    classCountRanges: {},
  },
});
const b2 = ms(() => solve(tasteBlocked, catalog));
out.tasteBlocked = {
  kind: b2.r.kind,
  ms: b2.dt,
  menuKinds: b2.r.kind === "relaxation" ? b2.r.menu.map((m) => m.kind) : null,
  noFakePlan: b2.r.kind !== "plan",
};

// ---- Scenario B3: the kill-question brief (PRD §17 verbatim): ~5'×6' room, tub +
// shower + double vanity + toilet → honest out-of-scope wall, no fake plan, no crash.
const kill = brief({
  polygon: { vertices: rect(1524, 1829), ccw: true, wallThicknessMm: 100 },
  budget: { bMax: 150000, bTarget: 120000 },
  featureConstraints: {
    requiredFeatures: [],
    preferredClasses: [],
    finishFamilies: ["white", "chrome"],
    classCountRanges: {
      tub: { min: 1, max: 1 },
      shower: { min: 1, max: 1 },
      vanity: { min: 2, max: 2 },
      toilet: { min: 1, max: 1 },
    },
  },
});
const b3 = ms(() => solve(kill, catalog));
out.killBrief = {
  kind: b3.r.kind,
  ms: b3.dt,
  outOfScope: b3.r.kind === "out-of-scope" ? b3.r.outOfScope : null,
  noFakePlan: b3.r.kind !== "plan",
};

// ---- Scenario C: menu-richness hunt (TODO-27) — do any demo-reachable briefs
// produce ≥2 distinct validated recovery plans?
out.menuHunt = [];
for (const [name, inp] of Object.entries({
  addTub_b100k: brief({
    budget: { bMax: 100000, bTarget: 80000 },
    featureConstraints: {
      requiredFeatures: [],
      preferredClasses: [],
      finishFamilies: ["white", "chrome"],
      classCountRanges: { tub: { min: 1, max: 1 } },
    },
  }),
  addVanity: brief({
    budget: { bMax: 100000, bTarget: 80000 },
    featureConstraints: {
      requiredFeatures: [],
      preferredClasses: [],
      finishFamilies: ["white", "chrome"],
      classCountRanges: { vanity: { min: 1, max: 1 } },
    },
  }),
  addShower: brief({
    budget: { bMax: 100000, bTarget: 80000 },
    featureConstraints: {
      requiredFeatures: [],
      preferredClasses: [],
      finishFamilies: ["white", "chrome"],
      classCountRanges: { shower: { min: 1, max: 1 } },
    },
  }),
  matteBlackTaste: brief({
    budget: { bMax: 150000, bTarget: 120000 },
    featureConstraints: {
      requiredFeatures: [],
      preferredClasses: [],
      finishFamilies: ["matte_black"],
      classCountRanges: {},
    },
  }),
  matteBlackTasteLuxury: brief({
    budget: { bMax: 150000, bTarget: 120000 },
    priority: "luxury",
    featureConstraints: {
      requiredFeatures: [],
      preferredClasses: [],
      finishFamilies: ["matte_black"],
      classCountRanges: {},
    },
  }),
})) {
  const { r, dt } = ms(() => solve(inp, catalog));
  out.menuHunt.push({
    brief: name,
    kind: r.kind,
    menuSize: r.kind === "relaxation" ? r.menu.length : 0,
    menuKinds: r.kind === "relaxation" ? r.menu.map((m) => m.kind) : null,
    ms: dt,
  });
}

console.log(JSON.stringify(out, null, 2));
