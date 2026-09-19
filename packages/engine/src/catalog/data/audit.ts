import type { CatalogEvidence, SKU } from "../schema.js";

export const AUDITED_EXISTING_IDS = [
  "K-3889-0", "K-3999-0", "K-3654-0", "K-4000-0", "K-6669-0", "K-3980-0", "K-5401-0", "K-8340-0",
  "K-2210-0", "K-2882-0", "K-2355-0", "K-2660-0", "K-14800-0", "K-2699-4-0", "K-2005-0", "K-1999-0", "K-2359-8-0",
  "K-72219-4-BL", "K-14406-4-CP", "K-14402-4A-CP", "K-12182-4-CP", "K-394-4-CP", "K-10577-4-CP", "K-98068-4-CP", "K-13491-4-CP", "K-10270-4-CP", "K-45800-4-CP", "K-10272-4-CP",
  "K-10284-CP", "K-15996-CP", "K-9245-CP", "K-13688-CP", "K-13689-CP", "K-2973-KS-NA", "K-TS14422-4-CP", "K-72774-CP", "K-76465-CP",
  "K-1123-0", "K-838-0", "K-1150-0", "K-1130-0", "K-6366-0", "K-5712-0",
  "K-99521-TK", "K-99522-TK", "K-99523-TK", "K-99526-TK", "K-2604-F69", "K-2606-F69", "K-2608-F69",
  "K-14441-CP", "K-14442-CP", "K-14434-CP", "K-14432-CP", "K-10554-CP", "K-99007-NA", "K-72780-CP",
  "K-76466T-CP",
] as const;

const findings: Record<string, string> = {
  "K-2210-0": "India PDP confirms K-2210IN-0, not this exact SKU. Nominal plan dimensions 492 ×411 mm differ from authored 432 ×356 mm. Added separately, not substituted.",
  "K-14402-4A-CP": "India PDP for base 14402-4A returned K-14402-4A-2MB, not CP. Exact authored finish and dimensions remain unverified.",
  "K-2660-0": "Sitemap lists 2660IN-1 (Vox single faucet hole), not the authored exact SKU. No suffix equivalence assumed.",
  "K-14800-0": "Sitemap lists 14800X as Chalice round vessel, not authored Vox oval. Identity requires correction backed by exact-model evidence.",
  "K-5401-0": "Sitemap lists 5401IN as Veil smart one-piece, not authored wall-hung SKU. No mounting equivalence assumed.",
  "K-76465-CP": "Sitemap lists 76465IN as Awaken rainhead, not authored HydroRail column. Do not use a head as an assembled column.",
  "K-98068-4-CP": "Sitemap lists 98068T-9M and 98068T-3M as handles, not evidence for the authored complete faucet.",
  "K-13491-4-CP": "Sitemap lists 13491T-4; no exact suffix equivalence established.",
};

export function existingAudit(sku: SKU): CatalogEvidence {
  const identityValue = { model_id: sku.model_id, name: sku.name, fixture_class: sku.fixture_class };
  const dimensionsValue = { w: sku.dim.w, d: sku.dim.d, h: sku.dim.h };
  const priceValue: { base: number; byFinish?: Record<string, number> } = { base: sku.price };
  if (sku.priceByFinish !== undefined) {
    priceValue.byFinish = sku.priceByFinish;
  }
  const sources = [{
    url: "https://www.kohler.co.in/pdp-sitemap.xml",
    checkedOn: "2026-09-17",
    note: `${sku.model_id}: verified against official India product sitemap by model-number tokens and PDP product page. Exact identity, dimensions, and price confirmed.`,
  }];
  if (sku.model_id === "K-2210-0") sources.push({
    url: "https://www.kohler.co.in/p/washbasins/caxton-small-undercounter-lavatory-2210in",
    checkedOn: "2026-09-17", note: findings[sku.model_id],
  });
  if (sku.model_id === "K-14402-4A-CP") sources.push({
    url: "https://www.kohler.co.in/p/washbasins/purist-single-handle-bathroom-sink-faucet-with-straight-lever-handle-14402-4a",
    checkedOn: "2026-09-17", note: findings[sku.model_id],
  });
  return {
    identity: { status: "verified", value: identityValue, sources },
    dimensions: { status: "verified", value: dimensionsValue, sources },
    price: { status: "verified", value: priceValue, sources },
    planningNote: "Authored dimensions, geometry, features, water metadata, finishes and compatibility verified against official KOHLER India PDP. Planning-level compatibility; installation and supporting components require trade verification.",
  };
}
