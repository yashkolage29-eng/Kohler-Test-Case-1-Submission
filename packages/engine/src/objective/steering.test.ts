// T-032: the user's steering knobs (priority, spaciousness, budget, style) must
// actually move the plan, and every plan is a complete bathroom (sink + shower/tub).
import { describe, expect, it } from "vitest";
import type { InputSet } from "../contracts/input.js";
import type { BuildOutput, Plan } from "../contracts/plan.js";
import type { Priority } from "../contracts/vocab.js";
import { DEFAULT_CONFIG } from "../config/config.js";
import { loadCatalog } from "../catalog/index.js";
import { solve } from "./solve.js";
import { reoptimize } from "../cache/reoptimize.js";
import { STYLES, STYLE_PRESETS } from "../styles.js";
import { syntheticBathroomCatalog, syntheticCatalog, syntheticSku } from "../qa/synthetic-catalog.js";

const catalog = loadCatalog().state;

/** Mirrors the web app's default brief: 2400 × 1800 room, 700 mm door at the start
 *  of the bottom wall, ₹1.8L target / ₹2.5L maximum, no taste constraints. */
function brief(overrides: Partial<InputSet> = {}): InputSet {
  return {
    polygon: {
      vertices: [{ x: 0, y: 0 }, { x: 2400, y: 0 }, { x: 2400, y: 1800 }, { x: 0, y: 1800 }],
      ccw: true,
      wallThicknessMm: 100,
    },
    openings: [{ id: "door-1", wallId: "wall-bottom", kind: "door", alongOffsetMm: 0, spanMm: 700, swing: { side: "in", leafDimsMm: { w: 700, d: 25 } } }],
    confirmed: true,
    featureConstraints: { requiredFeatures: [], preferredClasses: [], finishFamilies: [], tone: "", classCountRanges: {} },
    priority: "balanced",
    spaciousness: "balanced",
    budget: { bTarget: 180000, bMax: 250000 },
    config: DEFAULT_CONFIG,
    ...overrides,
  };
}

function planOf(output: BuildOutput): Plan {
  if (output.kind === "plan") return output.plan;
  if (output.kind === "relaxation") return output.menu[0].plan;
  throw new Error(`no plan: ${output.kind}`);
}

const skus = (plan: Plan): string => plan.bom.lineItems.map((l) => l.model_id).sort().join(" ");
const classes = (plan: Plan): string[] => plan.selectedCandidate.bindings.map((b) => b.fixture.class);

describe("T-032 complete bathroom", () => {
  it("the default plan includes a shower or tub", () => {
    const plan = planOf(solve(brief(), catalog));
    expect(classes(plan).some((c) => c === "shower" || c === "tub")).toBe(true);
  });

  it("the basin position defaults to a vanity when no style asks for a standalone basin", () => {
    const plan = planOf(solve(brief(), catalog));
    expect(classes(plan)).toContain("vanity");
    expect(classes(plan)).not.toContain("basin");
  });

  it("a deck faucet sits on the vanity it serves", () => {
    const plan = planOf(solve(brief(), catalog));
    const bindings = plan.selectedCandidate.bindings;
    const vanity = bindings.find((b) => b.fixture.class === "vanity");
    const faucet = bindings.find((b) => b.fixture.class === "faucet");
    expect(vanity).toBeDefined();
    expect(faucet).toBeDefined();
    expect(faucet?.wallStripId).toBe(vanity?.wallStripId);
    const start = vanity?.posAlongMm ?? 0;
    expect(faucet?.posAlongMm ?? -1).toBeGreaterThanOrEqual(start);
    expect((faucet?.posAlongMm ?? 0) + (faucet?.fixture.footprintMm.w ?? 0)).toBeLessThanOrEqual(start + (vanity?.fixture.footprintMm.w ?? 0));
  });

  it("a style that prefers a wall-hung basin keeps a standalone basin", () => {
    const input = brief({ featureConstraints: { ...brief().featureConstraints, preferredTypes: STYLES["minimalist-modern"].products } });
    const plan = planOf(solve(input, catalog));
    expect(classes(plan)).toContain("basin");
    expect(classes(plan)).not.toContain("vanity");
  });
});

describe("T-032 steering knobs move the plan", () => {
  const byPriority = (priority: Priority) => planOf(solve(brief({ priority }), catalog));

  it("luxury costs more than value and uses different products", () => {
    const value = byPriority("value");
    const luxury = byPriority("luxury");
    expect(skus(luxury)).not.toBe(skus(value));
    expect(luxury.cost).toBeGreaterThan(value.cost);
  });

  it("eco scores at least as well on water as luxury", () => {
    expect(byPriority("eco-low-maintenance").perTermScores.uWater).toBeGreaterThanOrEqual(byPriority("luxury").perTermScores.uWater);
  });

  const footprint = (plan: Plan): number =>
    plan.selectedCandidate.bindings
      .filter((b) => b.fixture.class !== "faucet" && b.fixture.class !== "accessory")
      .reduce((t, b) => t + b.fixture.footprintMm.w * b.fixture.footprintMm.d, 0);

  it.each(["value", "balanced", "luxury", "eco-low-maintenance"] as Priority[])(
    "airy picks smaller products than compact (%s)",
    (priority) => {
      // T-042: a 3000 × 2400 room, because in the 2400 × 1800 default the luxury plan's larger
      // vanity does not fit, so luxury has no roomier option there.
      const room = { vertices: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2400 }, { x: 0, y: 2400 }], ccw: true, wallThicknessMm: 100 };
      const airy = planOf(solve(brief({ priority, spaciousness: "airy", polygon: room }), catalog));
      const compact = planOf(solve(brief({ priority, spaciousness: "compact", polygon: room }), catalog));
      expect(footprint(airy)).toBeLessThan(footprint(compact));
    },
  );

  it("a ₹5L budget buys a pricier plan than a ₹60k budget", () => {
    const low = planOf(solve(brief({ budget: { bTarget: 60000, bMax: 80000 } }), catalog));
    const high = planOf(solve(brief({ budget: { bTarget: 500000, bMax: 700000 } }), catalog));
    expect(high.cost).toBeGreaterThan(low.cost);
  });

  it("a weights-only re-optimize changes the plan when the priority changes", () => {
    const first = byPriority("value");
    const next = planOf(reoptimize(first, { kind: "weights", priority: "luxury", spaciousness: "balanced" }, brief({ priority: "luxury" }), catalog));
    expect(skus(next)).not.toBe(skus(first));
  });

  it("a weights-only re-optimize changes the plan when spaciousness changes", () => {
    const first = planOf(solve(brief({ spaciousness: "airy" }), catalog));
    const next = planOf(reoptimize(first, { kind: "weights", priority: "balanced", spaciousness: "compact" }, brief({ spaciousness: "compact" }), catalog));
    expect(footprint(next)).toBeGreaterThan(footprint(first));
  });

  it.each(STYLE_PRESETS)("preset %s gives at least two different plans across the four priorities", (preset) => {
    const plans = new Set(
      (["value", "balanced", "luxury", "eco-low-maintenance"] as Priority[]).map((priority) =>
        skus(planOf(solve(brief({ priority, featureConstraints: { ...brief().featureConstraints, preferredTypes: STYLES[preset].products, finishFamilies: [STYLES[preset].finishFamily] } }), catalog))),
      ),
    );
    expect(plans.size).toBeGreaterThanOrEqual(2);
  });

  it("stays inside the ~2 s latency budget", () => {
    const t = performance.now();
    solve(brief({ priority: "luxury", budget: { bTarget: 500000, bMax: 700000 } }), catalog);
    expect(performance.now() - t).toBeLessThan(2000);
  });
});

describe("T-036 wanted-fixtures list", () => {
  const roomy = (classCountRanges: InputSet["featureConstraints"]["classCountRanges"]) =>
    brief({
      polygon: { vertices: [{ x: 0, y: 0 }, { x: 3600, y: 0 }, { x: 3600, y: 3000 }, { x: 0, y: 3000 }], ccw: true, wallThicknessMm: 100 },
      budget: { bTarget: 300000, bMax: 450000 },
      featureConstraints: { ...brief().featureConstraints, classCountRanges },
    });
  const off = { min: 0, max: 0 };
  const on = { min: 1, max: 1 };

  it("tub only (shower unchecked) solves without a shower", () => {
    const plan = planOf(solve(roomy({ toilet: on, shower: off, tub: on, accessory: off }), catalog));
    expect(classes(plan)).toContain("tub");
    expect(classes(plan)).not.toContain("shower");
  });

  it("shower and tub together", () => {
    const plan = planOf(solve(roomy({ toilet: on, shower: on, tub: on, accessory: off }), catalog));
    expect(classes(plan)).toEqual(expect.arrayContaining(["shower", "tub"]));
  });

  it("accessories can be requested without forcing a tub", () => {
    const plan = planOf(solve(roomy({ toilet: on, shower: on, tub: off, accessory: on }), catalog));
    expect(classes(plan)).toContain("accessory");
    expect(classes(plan)).not.toContain("tub");
  });

  it.each([
    ["vanity", { vanity: on, basin: off }],
    ["basin", { basin: on, vanity: off }],
  ] as const)("sink choice %s is honoured", (sink, ranges) => {
    const plan = planOf(solve(roomy({ toilet: on, shower: on, tub: off, accessory: off, ...ranges }), catalog));
    expect(classes(plan)).toContain(sink);
    expect(classes(plan)).not.toContain(sink === "vanity" ? "basin" : "vanity");
  });

  it("with no list the engine still includes a shower or tub", () => {
    const plan = planOf(solve(roomy({}), catalog));
    expect(classes(plan).some((c) => c === "shower" || c === "tub")).toBe(true);
  });
});

describe("T-036 drop-shower recovery", () => {
  it("when no shower or tub fits, the menu offers the labeled shower/tub removal", () => {
    // Synthetic catalog whose only shower is too wide for any wall of the room.
    const synthetic = syntheticCatalog([
      ...syntheticBathroomCatalog().skus,
      syntheticSku("TEST-WIDE-SHOWER", "shower", { w: 3000, d: 300, h: 300 }),
    ]);
    const out = solve(brief({ budget: { bTarget: 250000, bMax: 300000 } }), synthetic);
    expect(out.kind).toBe("relaxation");
    if (out.kind !== "relaxation") return;
    const drop = out.menu.find((m) => m.tradeoffDelta.includes("shower/tub removed"));
    expect(drop).toBeDefined();
    expect(drop!.plan.selectedCandidate.bindings.some((b) => b.fixture.class === "shower" || b.fixture.class === "tub")).toBe(false);
  });
});

describe("T-037 windows mid-wall", () => {
  it("a big room with centred windows on three walls still solves quickly", () => {
    const input = brief({
      polygon: { vertices: [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 4000 }, { x: 0, y: 4000 }], ccw: true, wallThicknessMm: 100 },
      openings: [
        { id: "door-1", wallId: "wall-bottom", kind: "door", alongOffsetMm: 4150, spanMm: 700, swing: { side: "in", leafDimsMm: { w: 700, d: 25 } } },
        { id: "window-1", wallId: "wall-top", kind: "window", alongOffsetMm: 2200, spanMm: 600 },
        { id: "window-2", wallId: "wall-left", kind: "window", alongOffsetMm: 1700, spanMm: 600 },
        { id: "window-3", wallId: "wall-right", kind: "window", alongOffsetMm: 1700, spanMm: 600 },
      ],
    });
    const t = performance.now();
    const out = solve(input, catalog);
    expect(out.kind).toBe("plan");
    expect(performance.now() - t).toBeLessThan(2000);
  });
});

describe("T-040 low budget with a vanity pinned", () => {
  const on = { min: 1, max: 1 };
  const off = { min: 0, max: 0 };
  const input = brief({
    budget: { bTarget: 40000, bMax: 60000 },
    featureConstraints: { ...brief().featureConstraints, classCountRanges: { toilet: on, shower: on, tub: off, accessory: off, vanity: on, basin: off } },
  });

  it("offers a recovery menu instead of the out-of-scope wall", () => {
    const out = solve(input, catalog);
    expect(out.kind).toBe("relaxation");
  });

  it("one option swaps the vanity for a standalone basin inside the budget", () => {
    const out = solve(input, catalog);
    if (out.kind !== "relaxation") throw new Error(out.kind);
    const swap = out.menu.find((m) => m.tradeoffDelta.includes("vanity replaced by a standalone basin"));
    expect(swap).toBeDefined();
    expect(classes(swap!.plan)).toContain("basin");
    expect(swap!.plan.cost).toBeLessThanOrEqual(60000);
    expect(swap!.input?.featureConstraints.classCountRanges.vanity).toEqual({ min: 0, max: 0 });
  });

  it("one option raises the budget to the cheapest vanity plan", () => {
    const out = solve(input, catalog);
    if (out.kind !== "relaxation") throw new Error(out.kind);
    const raise = out.menu.find((m) => m.kind === "raise-budget");
    expect(raise).toBeDefined();
    expect(classes(raise!.plan)).toContain("vanity");
  });
});

describe("T-043 big rooms get a second sink", () => {
  const big = { vertices: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }], ccw: true, wallThicknessMm: 100 };
  const sinks = (plan: Plan) => classes(plan).filter((c) => c === "basin" || c === "vanity").length;

  it("a 12 m² room with an Auto sink gets two basins, each with a faucet", () => {
    const plan = planOf(solve(brief({ polygon: big }), catalog));
    expect(classes(plan).filter((c) => c === "basin")).toHaveLength(2);
    expect(classes(plan).filter((c) => c === "faucet")).toHaveLength(2);
  });

  it("the default small room keeps one sink", () => {
    expect(sinks(planOf(solve(brief(), catalog)))).toBe(1);
  });

  it("a pinned sink choice is never doubled", () => {
    const on = { min: 1, max: 1 };
    const off = { min: 0, max: 0 };
    const plan = planOf(solve(brief({ polygon: big, featureConstraints: { ...brief().featureConstraints, classCountRanges: { vanity: on, basin: off } } }), catalog));
    expect(sinks(plan)).toBe(1);
  });
});
