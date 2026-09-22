// T-028: deck faucets mount on their basin; vessel basins take tall faucets only; style
// preferred product types steer SKU choice and fall back instead of failing.
import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, STYLES, STYLE_PRESETS, loadCatalog, solve } from "../index.js";
import type { InputSet } from "../contracts/input.js";
import type { Vec2 } from "../contracts/geometry.js";
import { buildBathroomRep } from "../geometry/room.js";
import { resolvePlacement } from "../geometry/rules/common.js";
import { productType } from "../catalog/traits.js";

const v = (x: number, y: number): Vec2 => ({ x, y });
const { state: catalog } = loadCatalog();
const byId = new Map(catalog.skus.map((s) => [s.model_id, s] as const));

function input(w: number, d: number, preset?: (typeof STYLE_PRESETS)[number]): InputSet {
  return {
    polygon: { vertices: [v(0, 0), v(w, 0), v(w, d), v(0, d)], ccw: true, wallThicknessMm: 100 },
    openings: [{ id: "door-1", wallId: "wall-bottom", kind: "door", alongOffsetMm: 900, spanMm: 600, swing: { side: "in", leafDimsMm: { w: 600, d: 25 } } }],
    confirmed: true,
    featureConstraints: {
      requiredFeatures: [],
      preferredClasses: [],
      finishFamilies: preset ? [STYLES[preset].finishFamily] : [],
      classCountRanges: {},
      preferredTypes: preset ? STYLES[preset].products : undefined,
    },
    priority: "balanced",
    spaciousness: "balanced",
    budget: { bMax: 400000, bTarget: 280000 },
    config: DEFAULT_CONFIG,
  };
}

function plan(i: InputSet) {
  const out = solve(i, catalog);
  if (out.kind !== "plan") throw new Error(`expected plan, got ${out.kind}`);
  return out.plan;
}

describe("deck faucet placement", () => {
  it.each([undefined, ...STYLE_PRESETS])("faucet sits inside its basin on the same wall (%s)", (preset) => {
    const i = input(2400, 1800, preset);
    const p = plan(i);
    const rep = buildBathroomRep(i);
    if (!rep.ok) throw new Error("rep");
    const bindings = p.selectedCandidate.bindings;
    // T-032: a vanity's integrated basin hosts the faucet too.
    const basins = bindings.filter((b) => b.fixture.class === "basin" || b.fixture.class === "vanity");
    const faucets = bindings.filter((b) => b.fixture.class === "faucet");
    expect(faucets.length).toBeGreaterThan(0);
    for (const faucet of faucets) {
      const f = resolvePlacement(faucet, rep.rep);
      if (!f.ok) throw new Error("faucet placement");
      const host = basins.find((b) => {
        const h = resolvePlacement(b, rep.rep);
        return h.ok && b.wallStripId === faucet.wallStripId &&
          f.placement.aabb.min.x >= h.placement.aabb.min.x && f.placement.aabb.max.x <= h.placement.aabb.max.x &&
          f.placement.aabb.min.y >= h.placement.aabb.min.y && f.placement.aabb.max.y <= h.placement.aabb.max.y;
      });
      expect(host, faucet.fixture.skuId).toBeDefined();
    }
    expect(p.receipt.firedRuleTrace.every((r) => r.pass)).toBe(true);
  });
});

describe("basin × faucet fit", () => {
  it("vessel basins pair only with tall faucets, other basins only with standard ones", () => {
    for (const basin of catalog.skus.filter((s) => s.fixture_class === "basin")) {
      for (const id of catalog.compatibilityGraph.get(basin.model_id) ?? []) {
        const other = byId.get(id);
        if (other?.fixture_class !== "faucet") continue;
        expect(productType(other) === "tall", `${basin.model_id}/${id}`).toBe(productType(basin) === "vessel");
      }
    }
  });
});

describe("style preferred product types", () => {
  const signature = (i: InputSet) =>
    plan(i).selectedCandidate.bindings.map((b) => b.fixture.skuId).sort().join(",");

  it("presets pick different products in a roomy bathroom", () => {
    const sets = new Set(STYLE_PRESETS.map((preset) => signature(input(3000, 2400, preset))));
    expect(sets.size).toBeGreaterThanOrEqual(6);
  });

  it("uses the preferred basin form when it fits", () => {
    for (const preset of STYLE_PRESETS) {
      const want = STYLES[preset].products.basin;
      const basin = plan(input(3000, 2400, preset)).selectedCandidate.bindings.find((b) => b.fixture.class === "basin");
      expect(productType(byId.get(basin!.fixture.skuId)!), preset).toBe(want);
    }
  });

  it("drops only the preference that cannot fit, keeping the rest", () => {
    // Coastal wants a two-piece WC, which has no valid layout in this room; the solve drops
    // the toilet preference and still keeps the undercounter basin.
    const bindings = plan(input(2400, 1800, "coastal")).selectedCandidate.bindings;
    const typeOf = (cls: string) => productType(byId.get(bindings.find((b) => b.fixture.class === cls)!.fixture.skuId)!);
    expect(typeOf("toilet")).not.toBe("two-piece");
    expect(typeOf("basin")).toBe("undercounter");
  });
});
