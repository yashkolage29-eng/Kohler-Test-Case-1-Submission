// T-007 C7-evaluator tests: override precedence (veto > force > default), the
// finish-harmony default rule, feature-constraint pass/fail, the mounting
// invariant (ADR-019), substitute-map symmetry/sorting (§8), and the gate that
// quarantined / dangling / self-referenced SKUs never enter the graph. Mutants
// are in-memory fixtures — never the data/ modules.

import { describe, expect, it } from "vitest";

import type { SKU } from "../catalog/schema.js";
import { buildCatalog } from "../catalog/validate.js";
import { compatibilityGraph, defaultOk, substituteMap } from "../catalog/graph.js";
import type { CatalogState, Finish } from "../catalog/schema.js";
import type { Fixture, FixtureBinding } from "../contracts/candidate.js";
import type { FeatureTag, FixtureClass } from "../contracts/vocab.js";
import { evaluateC7, c7FeatureSet, type C7FeatureSet } from "./c7_compat.js";

const FINISH_TABLE: Finish[] = [
  { id: "white", label: "White", family: "white", luxuryPoints: 1, wearResistance: 4, swatchHex: "#F6F7F8" },
  { id: "chrome", label: "Chrome", family: "chrome", luxuryPoints: 2, wearResistance: 5, swatchHex: "#C9D1D4" },
  { id: "matte_black", label: "Matte Black", family: "matte_black", luxuryPoints: 3, wearResistance: 3, swatchHex: "#23272A" },
];
const FAMILIES = new Map(FINISH_TABLE.map((f) => [f.id, f.family] as const));

const SKU = (id: string, cls: FixtureClass, finishes: string[], tags: FeatureTag[] = ["floor_mount"], compat: string[] = []): SKU => {
  const sku: SKU = {
  model_id: id,
  name: `Test ${id}`,
  category: cls === "toilet" ? "Toilets" : cls === "faucet" ? "Faucets" : "Basins",
  fixture_class: cls,
  dim: { w: 400, d: 400, h: 400 },
  finish_options: finishes,
  price: 10000,
  geometry_descriptor: {
    anchor: "floor-back-center",
    primitives: [{ part: cls === "toilet" ? "bowl" : "body", kind: { shape: "box", sizeMm: { w: 400, d: 400, h: 400 } }, offsetMm: { x: 0, y: 0, z: 0 } }],
  },
  water: cls === "toilet" ? { flushLiters: 4.8 } : { flowRateLpm: 5.7 },
  feature_tags: tags,
  compatibility: compat,
  };
  sku.evidence = testEvidence(sku);
  return sku;
};

const testEvidence = (sku: SKU) => ({
  identity: { status: "verified", value: { model_id: sku.model_id, name: sku.name, fixture_class: sku.fixture_class }, sources: [{ url: "https://www.kohler.co.in/pdp-sitemap.xml", checkedOn: "2026-01-01", note: "Test fixture identity; not official data." }] },
  dimensions: { status: "verified", value: { ...sku.dim }, sources: [{ url: "https://www.kohler.co.in/pdp-sitemap.xml", checkedOn: "2026-01-01", note: "Test fixture dimensions; not official data." }] },
  price: { status: "verified", value: { base: sku.price }, sources: [{ url: "https://www.kohler.co.in/pdp-sitemap.xml", checkedOn: "2026-01-01", note: "Test fixture price; not official data." }] },
  planningNote: "Test-fixture evidence — engine gate coverage only.",
});

function stateFor(skus: SKU[], forced: [string, string][] = [], vetoes: [string, string][] = []): CatalogState {
  const key = ([a, b]: [string, string]) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  return {
    skus,
    compatibilityGraph: compatibilityGraph(skus, new Set(forced.map(key)), new Set(vetoes.map(key)), FAMILIES),
    substitutes: substituteMap(skus, []),
    dataGaps: [],
  };
}

let n = 0;
function bind(cls: FixtureClass, tags: FeatureTag[] = ["floor_mount"], id?: string): FixtureBinding {
  n += 1;
  const fixture: Fixture = {
    skuId: id ?? `K-${cls.toUpperCase()}-${n}`,
    class: cls,
    footprintMm: { w: 400, d: 400, h: 400 },
    classAffinity: [],
    orientation: 0,
    featureTags: tags,
    zones: [],
  };
  return { fixture, wallStripId: "wall-bottom", posAlongMm: 0, orientation: 0 };
}

const features = (required: FeatureTag[] = [], forbidden: FeatureTag[] = []): C7FeatureSet => ({
  required: [...required].sort(),
  forbidden: [...forbidden].sort(),
});

describe("compatibilityGraph — override precedence (SCHEMA §7.1)", () => {
  const A = SKU("K-A", "toilet", ["white"]);
  const B = SKU("K-B", "faucet", ["chrome"]);
  const C = SKU("K-C", "faucet", ["matte_black"]);

  it("default rule: white-ware class is neutral — toilet pairs with any finish", () => {
    expect(defaultOk(A, B, FAMILIES)).toBe(true);
  });

  it("finish-harmony default: non-white-ware pairs need a shared finish family", () => {
    expect(defaultOk(B, C, FAMILIES)).toBe(false);
    const chromeMate = SKU("K-D", "faucet", ["chrome"]);
    expect(defaultOk(B, chromeMate, FAMILIES)).toBe(true);
  });

  it("veto beats force beats default; closure is symmetric and sorted", () => {
    // A–B default-ok but vetoed; B–C disjoint finishes, forced; A–C default-ok.
    const key = ([a, b]: [string, string]) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
    const graph = compatibilityGraph([A, B, C], new Set([["K-B", "K-C"]].map(key)), new Set([["K-A", "K-B"]].map(key)), FAMILIES);
    expect(graph.get("K-A")).toEqual(["K-C"]); // veto removed K-B
    expect(graph.get("K-B")).toEqual(["K-C"]); // forced survives (disjoint by default)
    expect(graph.get("K-C")).toEqual(["K-A", "K-B"]); // symmetric, sorted
  });

  it("C7 fails exactly the vetoed pair and passes the rest", () => {
    const catalog = stateFor([A, B, C], [["K-B", "K-C"]], [["K-A", "K-B"]]);
    const verdict = evaluateC7(
      [bind("toilet", ["floor_mount"], "K-A"), bind("faucet", ["deck_mount"], "K-B")],
      catalog,
      features(),
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.measuredDeltas.incompatiblePairs).toBe(1);
    expect(verdict.explanation).toContain("c7-incompatible-pair:K-A/K-B");
    const ok = evaluateC7(
      [bind("toilet", ["floor_mount"], "K-A"), bind("faucet", ["deck_mount"], "K-C")],
      catalog,
      features(),
    );
    expect(ok.pass).toBe(true);
  });
});

describe("C7 — feature constraints", () => {
  const A = SKU("K-A", "toilet", ["white"], ["floor_mount", "low_flow"]);
  const B = SKU("K-B", "faucet", ["chrome"], ["deck_mount"]);
  const catalog = stateFor([A, B], [["K-A", "K-B"]]);

  it("required tag covered → pass; missing → counted once per tag", () => {
    expect(evaluateC7([bind("toilet", ["floor_mount", "low_flow"], "K-A")], catalog, features(["low_flow"])).pass).toBe(true);
    const missing = evaluateC7([bind("faucet", ["deck_mount"], "K-B")], catalog, features(["low_flow", "soft_close"]));
    expect(missing.pass).toBe(false);
    expect(missing.measuredDeltas.failedFeatureConstraints).toBe(2);
    expect(missing.explanation).toContain("c7-missing-required:low_flow");
    expect(missing.explanation).toContain("c7-missing-required:soft_close");
  });

  it("forbidden tag on any bound fixture fails, all occurrences enumerated", () => {
    const v = evaluateC7(
      [bind("toilet", ["floor_mount", "low_flow"], "K-A"), bind("faucet", ["deck_mount", "low_flow"], "K-B")],
      catalog,
      features([], ["low_flow"]),
    );
    expect(v.pass).toBe(false);
    expect(v.measuredDeltas.failedFeatureConstraints).toBe(2);
    expect(v.explanation).toContain("c7-forbidden-tag:low_flow:K-A");
    expect(v.explanation).toContain("c7-forbidden-tag:low_flow:K-B");
  });

  it("c7FeatureSet maps InputSet.requiredFeatures sorted, no forbidden", () => {
    const set = c7FeatureSet({ requiredFeatures: ["soft_close", "low_flow"], preferredClasses: [], finishFamilies: [], classCountRanges: {} });
    expect(set).toEqual({ required: ["low_flow", "soft_close"], forbidden: [] });
  });

  it("no short-circuit: unknown SKUs and missing features all surface", () => {
    const v = evaluateC7([bind("faucet", ["deck_mount"], "K-B")], catalog, features(["smart"]));
    expect(v.explanation).toContain("c7-missing-required:smart");
    const bad = evaluateC7(
      [bind("toilet", ["floor_mount"], "K-A"), bind("basin", ["wall_mount"], "K-C")],
      catalog,
      features(),
    );
    expect(bad.pass).toBe(false);
    expect(bad.explanation).toContain("c7-sku-not-in-graph:K-C");
  });
});

describe("C7 — mounting invariant (ADR-019)", () => {
  const A = SKU("K-A", "toilet", ["white"]);
  const B = SKU("K-B", "faucet", ["chrome"]);
  const catalog = stateFor([A, B], [["K-A", "K-B"]]);

  it("exactly one mounting tag passes; wall_mount is counted as a carrier-wall consequence", () => {
    const v = evaluateC7(
      [bind("toilet", ["floor_mount"], "K-A"), bind("faucet", ["wall_mount"], "K-B")],
      catalog,
      features(),
    );
    expect(v.pass).toBe(true);
    expect(v.measuredDeltas.wallMountFixtures).toBe(1);
  });

  it("zero or multiple mounting tags fail with the count in the explanation", () => {
    const none = evaluateC7([bind("toilet", [], "K-A")], catalog, features());
    expect(none.pass).toBe(false);
    expect(none.explanation).toContain("c7-mounting-tags:K-A=0");
    const two = evaluateC7([bind("faucet", ["deck_mount", "wall_mount"], "K-B")], catalog, features());
    expect(two.pass).toBe(false);
    expect(two.explanation).toContain("c7-mounting-tags:K-B=2");
  });
});

describe("substituteMap — §8 symmetry and sorting", () => {
  it("symmetric closure over survivors; keys/values sorted; dangling and self dropped", () => {
    const A = SKU("K-A", "toilet", ["white"]);
    const B = SKU("K-B", "toilet", ["white"]);
    const C = SKU("K-C", "toilet", ["white"], ["floor_mount"], ["K-ZZZ"]);
    const subs = substituteMap([A, B, C], [["K-B", "K-A"], ["K-A", "K-ZZZ"], ["K-C", "K-C"]]);
    expect([...subs.keys()]).toEqual(["K-A", "K-B", "K-C"]);
    expect(subs.get("K-A")).toEqual(["K-B"]); // dangling K-ZZZ dropped
    expect(subs.get("K-B")).toEqual(["K-A"]);
    expect(subs.get("K-C")).toEqual([]); // dangling/self refs dropped
  });
});

describe("catalog gate — quarantined SKUs never enter graph or valid candidates", () => {
  const base = SKU("K-T1", "toilet", ["white"]);

  it("DANGLING_REF, SELF_REFERENCE and BAD_MOUNTING SKUs are quarantined and absent from the graph", () => {
    const { state, report } = buildCatalog({
      catalogVersion: "test",
      finishes: FINISH_TABLE,
      skus: [
        base,
        SKU("K-DANGLE", "toilet", ["white"], ["floor_mount"], ["K-NOPE"]),
        SKU("K-SELF", "toilet", ["white"], ["floor_mount"], ["K-SELF"]),
        SKU("K-BADMOUNT", "toilet", ["white"], ["floor_mount", "wall_mount"]),
      ],
      overrides: { vetoes: [] },
    });
    const reasons = Object.fromEntries(report.records.map((r) => [r.model_id, r.reason]));
    expect(reasons["K-DANGLE"]).toBe("DANGLING_REF");
    expect(reasons["K-SELF"]).toBe("SELF_REFERENCE");
    expect(reasons["K-BADMOUNT"]).toBe("BAD_MOUNTING");
    expect(state.compatibilityGraph.has("K-DANGLE")).toBe(false);
    expect(state.compatibilityGraph.has("K-SELF")).toBe(false);
    expect(state.compatibilityGraph.has("K-BADMOUNT")).toBe(false);
    // C7 therefore flags them as not-in-graph — they can never be valid candidates.
    const v = evaluateC7([bind("toilet", ["floor_mount"], "K-SELF")], state, features());
    expect(v.pass).toBe(false);
    expect(v.explanation).toContain("c7-sku-not-in-graph:K-SELF");
  });
});

