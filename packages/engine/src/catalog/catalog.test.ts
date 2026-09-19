// SCHEMA §15 Stage-B gate: quarantine matrix, fixpoint integrity, override precedence,
// default rule, substitutes, geometry bbox, deterministic hash. Mutants are in-memory
// copies of valid records — never the data/ modules.
import { describe, expect, it } from "vitest";

import { buildCatalog, type CatalogInput } from "./validate.js";
import { auditedCatalogEntries, loadCatalog } from "./index.js";
import { AUDITED_EXISTING_IDS } from "./data/audit.js";
import { VERIFIED_ADDITIONS } from "./data/verified_additions.js";
import { FINISHES } from "./data/finishes.js";
import type { Finish, QuarantineReason } from "./schema.js";
import { QUARANTINE_REASONS } from "./schema.js";
import { FINISH_FAMILIES } from "../contracts/vocab.js";
import { DEFAULT_CONFIG } from "../config/config.js";
import { solve } from "../objective/solve.js";

const FINISH_TABLE: Finish[] = [
  { id: "white", label: "White", family: "white", luxuryPoints: 1, wearResistance: 4, swatchHex: "#F6F7F8" },
  { id: "chrome", label: "Chrome", family: "chrome", luxuryPoints: 2, wearResistance: 5, swatchHex: "#C9D1D4" },
  { id: "brushed_nickel", label: "Brushed Nickel", family: "brushed_nickel", luxuryPoints: 3, wearResistance: 4, swatchHex: "#A9AFB3" },
  { id: "matte_black", label: "Matte Black", family: "matte_black", luxuryPoints: 3, wearResistance: 3, swatchHex: "#23272A" },
];

const TOILET = {
  model_id: "K-T1",
  name: "Test two-piece toilet",
  category: "Toilets",
  fixture_class: "toilet",
  dim: { w: 375, d: 725, h: 785 },
  finish_options: ["white"],
  price: 27500,
  geometry_descriptor: {
    anchor: "floor-back-center",
    primitives: [
      { part: "bowl", kind: { shape: "box", sizeMm: { w: 375, d: 540, h: 400 } }, offsetMm: { x: 0, y: 0, z: 185 }, finishable: true },
      { part: "tank", kind: { shape: "box", sizeMm: { w: 375, d: 185, h: 785 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
    ],
  },
  water: { flushLiters: 4.8 },
  feature_tags: ["floor_mount", "elongated"],
  compatibility: [],
};

const FAUCET = (id: string, finishes: string[]) => ({
  model_id: id,
  name: `Test faucet ${id}`,
  category: "Faucets",
  fixture_class: "faucet",
  dim: { w: 45, d: 160, h: 140 },
  finish_options: finishes,
  price: 32000,
  geometry_descriptor: {
    anchor: "deck-center",
    primitives: [
      { part: "body", kind: { shape: "cylinder", radiusMm: 22, hMm: 140 }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      { part: "spout", kind: { shape: "box", sizeMm: { w: 32, d: 120, h: 30 } }, offsetMm: { x: 0, y: 110, z: 0 }, finishable: true },
    ],
  },
  water: { flowRateLpm: 5.7 },
  feature_tags: ["deck_mount", "single_lever"],
  compatibility: [],
});

const withEv = (r: unknown): unknown => {
  const raw = JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
  const source = (note: string) => [{
    url: "https://www.kohler.co.in/pdp-sitemap.xml",
    checkedOn: "2026-01-01", note,
  }];
  raw.evidence = {
    identity: { status: "verified", value: { model_id: raw.model_id, name: raw.name, fixture_class: raw.fixture_class }, sources: source("Test fixture identity; not official data.") },
    dimensions: { status: "verified", value: { ...raw.dim }, sources: source("Test fixture dimensions; not official data.") },
    price: { status: "verified", value: { base: raw.price }, sources: source("Test fixture price; not official data.") },
    planningNote: "Test-fixture evidence — engine gate coverage only.",
  };
  return raw;
};

const input = (skus: unknown[], vetoes: [string, string][] = []): CatalogInput => ({
  catalogVersion: "0.1.0",
  finishes: FINISH_TABLE,
  skus: skus.map(withEv),
  overrides: { vetoes },
});

const FC = FAUCET("K-FC", ["chrome"]);
const FB = FAUCET("K-FB", ["matte_black"]);
const FN = FAUCET("K-FN", ["brushed_nickel", "chrome"]);

// (unused helper removed)

const clone = (r: object, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...JSON.parse(JSON.stringify(r)),
  ...over,
});

describe("clean load", () => {
  it("loads a valid fixture set with zero quarantines and a stable hash", () => {
    const a = buildCatalog(input([clone(TOILET), clone(FC), clone(FB), clone(FN)]));
    const b = buildCatalog(input([clone(FN), clone(FB), clone(FC), clone(TOILET)]));
    expect(a.report.quarantinedCount).toBe(0);
    expect(a.report.loadedCount).toBe(4);
    expect(a.report.catalogHash).toBe(b.report.catalogHash);
    expect(a.report.snapshotId).toMatch(/^0\.1\.0#[0-9a-f]{8}$/);
    expect(a.state.dataGaps).toEqual([]);
  });

  it("loadCatalog() is deterministic across repeated calls", () => {
    expect(loadCatalog().report).toEqual(loadCatalog().report);
  });
});

describe("retail catalog evidence binding", () => {
  const additionsInput = (): CatalogInput => ({
    catalogVersion: "test-evidence-binding",
    finishes: FINISHES,
    skus: structuredClone(VERIFIED_ADDITIONS),
    overrides: { vetoes: [] },
  });

it("loads every existing authored entry with verified evidence, excluding geometry-mismatched SKUs from SKUs and graph endpoints", () => {
     const existing = auditedCatalogEntries();
     expect(existing).toHaveLength(58);
     expect(existing.map((sku) => sku.model_id).sort()).toEqual([...AUDITED_EXISTING_IDS].sort());
     const { state, report } = loadCatalog();
     const geometryRejected = ["K-14800-0", "K-2210-0", "K-2355-0", "K-2660-0", "K-2699-4-0", "K-2882-0"];
     const danglingRejected = ["K-1999-0", "K-2005-0", "K-2359-8-0"];
     expect(report.quarantinedCount).toBe(9);
     expect(report.records.filter((record) => record.reason === "GEOMETRY_BBOX_MISMATCH").map((record) => record.model_id)).toEqual(geometryRejected);
     expect(report.records.filter((record) => record.reason === "DANGLING_REF").map((record) => record.model_id)).toEqual(danglingRejected);
     expect(report.records.filter((record) => record.reason === "UNVERIFIED_EVIDENCE")).toHaveLength(0);
     for (const sku of existing) {
       expect(sku.evidence?.identity.status).toBe("verified");
       expect(sku.evidence?.dimensions.status).toBe("verified");
       const isRejected = [...geometryRejected, ...danglingRejected].includes(sku.model_id);
       expect(state.skus.some((loaded) => loaded.model_id === sku.model_id)).toBe(!isRejected);
       if (!isRejected) {
         for (const graph of [state.compatibilityGraph, state.substitutes]) {
           expect(graph.has(sku.model_id)).toBe(true);
         }
       }
     }
   });

it("loads authored SKUs with verified evidence alongside additions", () => {
     const { state, report } = loadCatalog();
     expect(state.skus.some((sku) => sku.model_id === "K-18655IN-ND-CP")).toBe(true);
     expect(report.loadedCount + report.quarantinedCount).toBe(88);
     expect(report.quarantinedCount).toBe(9);
     for (const sku of state.skus) {
       const evidence = sku.evidence;
       expect(evidence).toBeDefined();
       if (!evidence) throw new Error("missing authored evidence");
       expect(evidence.identity).toMatchObject({
         status: "verified", value: { model_id: sku.model_id, name: sku.name, fixture_class: sku.fixture_class },
       });
       expect(evidence.dimensions).toMatchObject({ status: "verified", value: sku.dim });
       expect(evidence.price).toMatchObject({ status: "verified", value: { base: sku.price } });
       for (const fact of [evidence.identity, evidence.dimensions, evidence.price]) {
         if (fact.status !== "verified") throw new Error("expected authored verified fact");
       }
     }
   });

it("covers six classes and documented low-flow and rainhead features without inventing stone finishes", () => {
     const { state } = loadCatalog();
     expect([...new Set(state.skus.map((sku) => sku.fixture_class))].sort()).toEqual([
       "accessory", "basin", "faucet", "shower", "toilet", "tub", "vanity",
     ]);
     expect(state.skus.find((sku) => sku.model_id === "K-18655IN-ND-CP")).toMatchObject({
       feature_tags: expect.arrayContaining(["low_flow", "touchless"]), water: { flowRateLpm: 1.9 },
     });
     expect(state.skus.find((sku) => sku.model_id === "K-73199IN-CP")).toMatchObject({
       feature_tags: expect.arrayContaining(["rain_shower"]), water: { flowRateLpm: 8.7 },
       dim: { w: 200, d: 200, h: 63.5 },
     });
     expect(state.skus.find((sku) => sku.model_id === "K-8331T-0")?.finish_options).toEqual(["white"]);
     expect(Object.fromEntries(
       ["accessory", "basin", "faucet", "shower", "toilet", "tub", "vanity"].map((cls) => [
         cls, state.skus.filter((sku) => sku.fixture_class === cls).length,
       ]),
     )).toEqual({ accessory: 9, basin: 6, faucet: 18, shower: 16, toilet: 14, tub: 9, vanity: 7 });
     expect(state.skus.find((sku) => sku.model_id === "K-28780IN-0")).toMatchObject({
       feature_tags: ["dual_flush", "wall_mount"],
       water: { flushLiters: 4, flushLightLiters: 2, dualFlush: true },
       dim: { w: 363.5, d: 557.2, h: 349.3 },
     });
     expect(state.skus.find((sku) => sku.model_id === "K-73040IN-CL-CP")).toMatchObject({
       feature_tags: ["rain_shower", "wall_mount"], water: { flowRateLpm: 9.5 },
       dim: { w: 254, d: 254, h: 61.9 },
     });
     expect(state.skus.find((sku) => sku.model_id === "K-73040IN-CL-BL")).toMatchObject({
       finish_options: ["matte_black"], price: 20300,
     });
     expect(state.skus.find((sku) => sku.model_id === "K-23472IN-4ND-BL")).toMatchObject({
       finish_options: ["matte_black"], water: { flowRateLpm: 15 },
     });
     expect(state.skus.find((sku) => sku.model_id === "K-73050-7-2MB")).toMatchObject({
       finish_options: ["vibrant_brushed_moderne_brass"],
     });
     expect(state.skus.find((sku) => sku.model_id === "K-28529IN-0")).toMatchObject({
       feature_tags: expect.arrayContaining(["smart", "bidet", "heated_seat", "self_cleaning", "touchless", "soft_close"]),
     });
   });

  it("covers evidence-backed finish families and documents brushed_nickel and stone as exposed-but-empty", () => {
    const { state } = loadCatalog();
    const familyOf = new Map(FINISHES.map((finish) => [finish.id, finish.family] as const));
    const covered = new Set(FINISH_FAMILIES.filter((family) =>
      state.skus.some((sku) => sku.finish_options.some((finishId) => familyOf.get(finishId) === family)),
    ));
    expect([...covered].sort()).toEqual(["brushed_gold", "brushed_nickel", "chrome", "matte_black", "stone", "white"]);
    for (const family of ["brushed_nickel", "stone"] as const) {
      expect(covered.has(family)).toBe(true);
    }
  });
    it("solves the proven feature combinations end-to-end", () => {
    const { state } = loadCatalog();
    for (const features of [["rain_shower", "thermostatic"], ["rain_shower", "low_flow", "thermostatic"], ["smart", "soft_close"]]) {
      const rect = { vertices: [{ x: 0, y: 0 }, { x: 2400, y: 0 }, { x: 2400, y: 1800 }, { x: 0, y: 1800 }], ccw: true, wallThicknessMm: 100 };
      const output = solve({
        polygon: rect, openings: [], confirmed: true,
        featureConstraints: { requiredFeatures: features, preferredClasses: [], finishFamilies: [], classCountRanges: {} },
        priority: "balanced", spaciousness: "balanced", budget: { bMax: 600000, bTarget: 480000 },
        config: { ...DEFAULT_CONFIG, slotGridMm: 200 },
      }, state);
      expect(output.kind).toBe("plan");
      if (output.kind !== "plan") continue;
      expect(output.plan.firedTrace.every((verdict) => verdict.pass)).toBe(true);
      const tags = new Set(output.plan.selectedCandidate.bindings.flatMap((binding) => binding.fixture.featureTags));
      for (const feature of features) expect(tags.has(feature)).toBe(true);
    }
  });

  for (const sku of VERIFIED_ADDITIONS) {
    it(`${sku.model_id}: binds its name and every dimension independently of source URLs`, () => {
      for (const field of ["name", "w", "d", "h"] as const) {
        const changed = structuredClone(sku);
        if (field === "name") changed.name += " OTHER";
        else changed.dim[field] += 1;
        const { report } = buildCatalog({ ...additionsInput(), skus: [changed] });
        expect(report.loadedCount).toBe(0);
        expect(report.records).toEqual([expect.objectContaining({
          model_id: changed.model_id, reason: "UNVERIFIED_EVIDENCE",
        })]);
      }
    });

    it(`${sku.model_id}: keeps an exact full-size bounding-box proxy`, () => {
      expect(sku.geometry_descriptor.primitives).toHaveLength(1);
      expect(sku.geometry_descriptor.primitives[0]).toMatchObject({
        kind: { shape: "box", sizeMm: sku.dim }, offsetMm: { x: 0, y: 0, z: 0 },
      });
    });
    for (const field of ["identity", "dimensions", "price"] as const) {
      it(`${sku.model_id}: rejects changed ${field} with unchanged source URLs`, () => {
        const changed = structuredClone(sku);
        if (field === "identity") changed.model_id += "-OTHER";
        if (field === "dimensions") changed.dim.w += 1;
        if (field === "price") changed.price += 1;
        const { state, report } = buildCatalog({ ...additionsInput(), skus: [changed] });
        expect(state.skus).toEqual([]);
        expect(report.records).toEqual([expect.objectContaining({
          model_id: changed.model_id, reason: "UNVERIFIED_EVIDENCE",
        })]);
      });

      it(`${sku.model_id}: rejects unverified ${field} despite retained official URLs`, () => {
        const changed = structuredClone(sku);
        const evidence = changed.evidence;
        if (!evidence) throw new Error("missing authored evidence");
        const fact = evidence[field];
        if (fact.status !== "verified") throw new Error("expected authored verified fact");
        evidence[field] = { status: "unverified", sources: fact.sources };
        const { state, report } = buildCatalog({ ...additionsInput(), skus: [changed] });
        expect(state.skus).toEqual([]);
        expect(report.records).toEqual([expect.objectContaining({
          model_id: changed.model_id, reason: "UNVERIFIED_EVIDENCE",
        })]);
      });
    }
  }
});

describe("quarantine matrix (§15.2) — one mutant per QuarantineReason", () => {
  it("covers all 13 reasons", () => {
    expect(QUARANTINE_REASONS).toHaveLength(13);
  });

  const mutantCases: [QuarantineReason, unknown[]][] = [
    ["MISSING_FIELD", [clone(TOILET, { geometry_descriptor: undefined })]],
    ["BAD_TYPE", [clone(TOILET, { name: 42 })]],
    ["BAD_ENUM", [clone(TOILET, { fixture_class: "showerhead" })]],
    ["BAD_NUMBER", [clone(TOILET, { price: 0 })]],
    ["DUPLICATE_ID", [clone(TOILET), clone(TOILET)]],
    ["BAD_MOUNTING", [clone(TOILET, { feature_tags: ["elongated"] })]],
    ["BAD_WATER_META", [clone(TOILET, { water: {} })]],
    ["DANGLING_REF", [clone(TOILET, { compatibility: ["K-NOPE"] })]],
    ["SELF_REFERENCE", [clone(TOILET, { compatibility: ["K-T1"] })]],
    ["BAD_SUBSTITUTE", [clone(TOILET, { substitutionIds: ["K-FC"] }), clone(FC)]],
    ["GEOMETRY_BBOX_MISMATCH", [clone(TOILET, {
      geometry_descriptor: {
        anchor: "floor-back-center",
        primitives: [{ part: "bowl", kind: { shape: "box", sizeMm: { w: 375, d: 540, h: 400 } }, offsetMm: { x: 0, y: 400, z: 185 } }],
      },
    })]],
    ["UNKNOWN_FINISH", [clone(TOILET, { finish_options: ["gold"] })]],
  ];

  for (const [reason, skus] of mutantCases) {
    it(`quarantines ${reason}`, () => {
      const { state, report } = buildCatalog(input(skus));
      const rec = report.records.find((r) => r.reason === reason);
      expect(rec, `expected a ${reason} record in ${JSON.stringify(report.records)}`).toBeDefined();
      expect(state.dataGaps).toContain(`${rec?.model_id}: ${reason} ${rec?.detail}`);
      if (reason === "DUPLICATE_ID") {
        // uniqueness keeps the first raw occurrence; only the later copy is quarantined
        expect(state.skus).toHaveLength(1);
        return;
      }
      const id = rec?.model_id as string;
      expect(state.skus.find((s) => s.model_id === id)).toBeUndefined();
      expect(state.compatibilityGraph.has(id)).toBe(false);
      expect(state.substitutes.has(id)).toBe(false);
    });
  }

  it("keeps the first duplicate and quarantines the later one", () => {
    const { report, state } = buildCatalog(input([clone(TOILET), clone(TOILET)]));
    expect(state.skus).toHaveLength(1);
    expect(report.records).toEqual([
      { model_id: "K-T1", reason: "DUPLICATE_ID", detail: "model_id already seen (first kept)" },
    ]);
  });
});

describe("transitive reference integrity (§15.3)", () => {
  it("quarantines referrers of quarantined SKUs to fixpoint", () => {
    const a = clone(TOILET, { model_id: "K-A", compatibility: ["K-B"] });
    const b = clone(TOILET, { model_id: "K-B", compatibility: ["K-C"] });
    const c = clone(TOILET, { model_id: "K-C", geometry_descriptor: undefined });
    const { state, report } = buildCatalog(input([a, b, c]));
    expect(state.skus).toHaveLength(0);
    const reasons = Object.fromEntries(report.records.map((r) => [r.model_id, r.reason]));
    expect(reasons).toEqual({ "K-A": "DANGLING_REF", "K-B": "DANGLING_REF", "K-C": "MISSING_FIELD" });
    expect(state.compatibilityGraph.size).toBe(0);
  });
});

describe("override precedence (§7.1) — veto > force > default", () => {
  it("veto beats force and default; force beats disjoint default; exact graph", () => {
    const t = clone(TOILET, { compatibility: ["K-FC"] }); // forced + default-ok + vetoed
    const fc = clone(FC, { compatibility: ["K-FB"] }); // force of a disjoint pair
    const { state, report } = buildCatalog(
      input([t, fc, clone(FB)], [["K-T1", "K-FC"], ["K-FC", "K-FB"]]),
    );
    expect(state.dataGaps).toContain("K-FC,K-T1: VETO_WINS pair also forced — veto wins");
    expect(state.dataGaps).toContain("K-FB,K-FC: VETO_WINS pair also forced — veto wins");
    // K-T1–K-FB survives via the white-ware default; both vetoed pairs are gone
    expect(state.compatibilityGraph.get("K-T1")).toEqual(["K-FB"]);
    expect(state.compatibilityGraph.get("K-FC")).toEqual([]);
    expect(state.compatibilityGraph.get("K-FB")).toEqual(["K-T1"]);
    expect(report.quarantinedCount).toBe(0);
  });

  it("redundant force and disjoint veto emit data-gaps but keep the graph correct", () => {
    const t = clone(TOILET, { compatibility: ["K-FC"] }); // already default-ok → redundant
    const { state } = buildCatalog(input([t, clone(FC), clone(FB)], [["K-FC", "K-FB"]]));
    expect(state.dataGaps).toContain("K-FC,K-T1: REDUNDANT_FORCE pair already default-ok");
    expect(state.dataGaps).toContain("K-FB,K-FC: VETO_DISJOINT pair not otherwise compatible — kept as authored");
    expect(state.compatibilityGraph.get("K-T1")).toEqual(["K-FB", "K-FC"]);
    expect(state.compatibilityGraph.get("K-FC")).toEqual(["K-T1"]);
    expect(state.compatibilityGraph.get("K-FB")).toEqual(["K-T1"]);
  });

  it("veto referencing unknown ids is ignored with a data-gap, never quarantines", () => {
    const { state, report } = buildCatalog(input([clone(TOILET)], [["K-T1", "K-NOPE"]]));
    expect(report.quarantinedCount).toBe(0);
    expect(state.dataGaps).toContain("K-T1,K-NOPE: VETO_DANGLING ignored (endpoint unknown)");
  });
});

describe("default rule (§7.2)", () => {
  it("white-ware pairs with everything; disjoint trim families do not; shared family does", () => {
    const { state } = buildCatalog(input([clone(TOILET), clone(FC), clone(FB), clone(FN)]));
    const g = state.compatibilityGraph;
    expect(g.get("K-T1")).toEqual(["K-FB", "K-FC", "K-FN"]); // white-ware neutral
    expect(g.get("K-FC")).toEqual(["K-FN", "K-T1"]); // chrome shared with K-FN
    expect(g.get("K-FB")).toEqual(["K-T1"]); // matte_black disjoint from chrome/nickel
  });
});

describe("substitutes (§8)", () => {
  it("same-class, symmetric closure, sorted; larger-footprint substitute flagged", () => {
    const t1 = clone(TOILET, { substitutionIds: ["K-T2", "K-T3"] });
    const t2 = clone(TOILET, {
      model_id: "K-T2",
      dim: { w: 375, d: 700, h: 400 },
      geometry_descriptor: {
        anchor: "floor-back-center",
        primitives: [{ part: "bowl", kind: { shape: "box", sizeMm: { w: 375, d: 500, h: 400 } }, offsetMm: { x: 0, y: 0, z: 0 } }],
      },
    });
    const t3 = clone(TOILET, { model_id: "K-T3", dim: { w: 400, d: 800, h: 785 } });
    const { state, report } = buildCatalog(input([t1, t2, t3]));
    expect(state.substitutes.get("K-T1")).toEqual(["K-T2", "K-T3"]);
    expect(state.substitutes.get("K-T2")).toEqual(["K-T1"]);
    expect(state.substitutes.get("K-T3")).toEqual(["K-T1"]);
    expect(state.dataGaps).toContain(
      "K-T1: LARGER_FOOTPRINT substitute K-T3 has a larger footprint than the source",
    );
    expect(report.quarantinedCount).toBe(0);
  });

  it("substituting across classes is quarantined (BAD_SUBSTITUTE)", () => {
    const { report } = buildCatalog(input([clone(TOILET, { substitutionIds: ["K-FC"] }), clone(FC)]));
    expect(report.records).toEqual([
      {
        model_id: "K-T1",
        reason: "BAD_SUBSTITUTE",
        detail: "substitute K-FC is of class faucet, not toilet",
      },
    ]);
  });
});





