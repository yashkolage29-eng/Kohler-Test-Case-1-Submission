// loadCatalog() — SCHEMA §9: aggregate the data/ modules, run the validation pipeline,
// canonicalize and hash, emit CatalogState + LoadReport. Pure; no Node/DOM APIs.
import type { CatalogState, LoadReport, SKU } from "./schema.js";
import { buildCatalog } from "./validate.js";
import { catalogVersion } from "./data/catalog_meta.js";
import { FINISHES } from "./data/finishes.js";
import { COMPAT_OVERRIDES } from "./data/compat_overrides.js";
import { TOILETS } from "./data/toilets.js";
import { BASINS } from "./data/basins.js";
import { FAUCETS } from "./data/faucets.js";
import { SHOWERS } from "./data/showers.js";
import { TUBS } from "./data/tubs.js";
import { VANITIES } from "./data/vanities.js";
import { ACCESSORIES } from "./data/accessories.js";
import { existingAudit } from "./data/audit.js";
import { VERIFIED_ADDITIONS } from "./data/verified_additions.js";

export function auditedCatalogEntries(): SKU[] {
  return [...TOILETS, ...BASINS, ...FAUCETS, ...SHOWERS, ...TUBS, ...VANITIES, ...ACCESSORIES]
    .map((sku) => ({ ...sku, evidence: sku.evidence ?? existingAudit(sku) }));
}

export { buildCatalog, type CatalogInput } from "./validate.js";
export { defaultOk, compatibilityGraph, substituteMap } from "./graph.js";
export { sha256Hex } from "./hash.js";

export function loadCatalog(): { state: CatalogState; report: LoadReport } {
  return buildCatalog({
    catalogVersion,
    finishes: FINISHES,
    skus: [...auditedCatalogEntries(), ...VERIFIED_ADDITIONS],
    overrides: COMPAT_OVERRIDES,
  });
}

export * from "./schema.js";
