import type { CatalogState, SKU } from "../catalog/schema.js";
import { CATEGORY_BY_CLASS, PART_VOCAB } from "../catalog/schema.js";

export function syntheticSku(
  model_id: string,
  fixture_class: SKU["fixture_class"],
  dim: SKU["dim"],
  overrides: Partial<SKU> = {},
): SKU {
  return {
    model_id,
    name: `Synthetic ${model_id}`,
    fixture_class,
    category: CATEGORY_BY_CLASS[fixture_class],
    dim,
    price: 10000,
    finish_options: [fixture_class === "faucet" || fixture_class === "shower" ? "chrome" : "white"],
    feature_tags: [fixture_class === "faucet" || fixture_class === "basin" ? "deck_mount" : "floor_mount"],
    water: fixture_class === "toilet" ? { flushLiters: 4.8 } : { flowRateLpm: 6 },
    geometry_descriptor: {
      anchor: "floor-back-center",
      primitives: [{
        part: PART_VOCAB[fixture_class][0],
        kind: { shape: "box", sizeMm: { ...dim } },
        offsetMm: { x: 0, y: 0, z: 0 },
      }],
    },
    compatibility: [],
    ...overrides,
  };
}

export function syntheticCatalog(skus: SKU[]): CatalogState {
  return {
    skus,
    compatibilityGraph: new Map(skus.map((sku) => [
      sku.model_id,
      skus.filter((other) => other.model_id !== sku.model_id).map((other) => other.model_id),
    ])),
    substitutes: new Map(),
    dataGaps: ["Synthetic algorithm fixtures; not retail products or verified evidence."],
  };
}

export function syntheticBathroomCatalog(): CatalogState {
  return syntheticCatalog([
    syntheticSku("TEST-TOILET", "toilet", { w: 375, d: 750, h: 800 }),
    syntheticSku("TEST-BASIN", "basin", { w: 300, d: 200, h: 150 }),
    syntheticSku("TEST-FAUCET", "faucet", { w: 45, d: 160, h: 140 }, {
      feature_tags: ["deck_mount", "single_lever"],
    }),
  ]);
}
