// Catalog schema — normative types per docs/PRODUCT_CATALOG_SCHEMA.md (SCHEMA) §3–§6,
// Appendix A. Closed vocabularies (FixtureClass/FinishFamily/FeatureTag/MountingTag) are
// owned by contracts/vocab (ADR-022) and re-exported here, never redefined.

import type { FinishFamily, FixtureClass, FeatureTag, MountingTag } from "../contracts/vocab.js";
import { FIXTURE_CLASSES } from "../contracts/vocab.js";

export type { FinishFamily, FixtureClass, FeatureTag, MountingTag };
export { FIXTURE_CLASSES };

/** SCHEMA §3.4 closed set. */
export type QuarantineReason =
  | "MISSING_FIELD"
  | "BAD_TYPE"
  | "BAD_ENUM"
  | "BAD_NUMBER"
  | "DUPLICATE_ID"
  | "BAD_MOUNTING"
  | "BAD_WATER_META"
  | "DANGLING_REF"
  | "SELF_REFERENCE"
  | "BAD_SUBSTITUTE"
  | "GEOMETRY_BBOX_MISMATCH"
  | "UNKNOWN_FINISH"
  | "UNVERIFIED_EVIDENCE";

export const QUARANTINE_REASONS: readonly QuarantineReason[] = [
  "MISSING_FIELD",
  "BAD_TYPE",
  "BAD_ENUM",
  "BAD_NUMBER",
  "DUPLICATE_ID",
  "BAD_MOUNTING",
  "BAD_WATER_META",
  "DANGLING_REF",
  "SELF_REFERENCE",
  "BAD_SUBSTITUTE",
  "GEOMETRY_BBOX_MISMATCH",
  "UNKNOWN_FINISH",
  "UNVERIFIED_EVIDENCE",
];

/** SCHEMA §6 anchor closed set. */
export type Anchor = "floor-back-center" | "wall-face-center" | "deck-center";

export const ANCHORS: readonly Anchor[] = [
  "floor-back-center",
  "wall-face-center",
  "deck-center",
];

/** SCHEMA §3.5 display category closed set. */
export type Category =
  | "Toilets"
  | "Smart Toilets"
  | "Basins"
  | "Faucets"
  | "Showers"
  | "Tubs"
  | "Vanities"
  | "Accessories";

export const CATEGORIES: readonly Category[] = [
  "Toilets",
  "Smart Toilets",
  "Basins",
  "Faucets",
  "Showers",
  "Tubs",
  "Vanities",
  "Accessories",
];

/** SCHEMA §3.5 mapping table. "Smart Toilets" is handled at validation time: it is
 *  valid only for class `toilet` carrying the `smart` tag. */
export const CATEGORY_BY_CLASS: Readonly<Record<FixtureClass, Category>> = {
  toilet: "Toilets",
  basin: "Basins",
  faucet: "Faucets",
  shower: "Showers",
  tub: "Tubs",
  vanity: "Vanities",
  accessory: "Accessories",
};

/** SCHEMA §6.2 per-class part vocabulary (closed). */
export const PART_VOCAB: Readonly<Record<FixtureClass, readonly string[]>> = {
  toilet: ["tank", "bowl", "seat", "lid"],
  basin: ["bowl", "pedestal", "counter", "rim"],
  faucet: ["body", "spout", "handle"],
  shower: ["valve", "head", "arm", "stem"],
  tub: ["shell"],
  vanity: ["cabinet", "top", "basin", "door", "kickboard"],
  accessory: ["body"],
};

/** SCHEMA §5 — millimetres, max one decimal place (SCHEMA §2.1). */
export interface DimMm {
  w: number;
  d: number;
  h: number;
}

/** SCHEMA §5 water metadata; mandatory for wet classes (§5.1). */
export interface WaterMeta {
  flowRateLpm?: number;
  flushLiters?: number;
  flushLightLiters?: number;
  dualFlush?: boolean;
}

/** SCHEMA §4 finish row. */
export interface Finish {
  id: string;
  label: string;
  family: FinishFamily;
  luxuryPoints: 1 | 2 | 3;
  wearResistance: 1 | 2 | 3 | 4 | 5;
  swatchHex: string;
}

/** SCHEMA §6 axis-aligned primitive (no rotation — AABB determinism). */
export interface GeoPrimitive {
  part: string;
  kind: { shape: "box"; sizeMm: DimMm } | { shape: "cylinder"; radiusMm: number; hMm: number };
  offsetMm: { x: number; y: number; z: number };
  finishable?: boolean;
}

/** SCHEMA §6 — the `render = catalog geometry` contract. */
export interface GeometryDescriptor {
  anchor: Anchor;
  primitives: GeoPrimitive[];
}

/** SCHEMA §5 / Appendix A — the normative SKU record. */
export interface SourceEvidence {
  url: string;
  checkedOn: string;
  note: string;
}

export type VerifiedFact<T> =
  | { status: "verified"; value: T; sources: SourceEvidence[] }
  | { status: "unverified"; sources: SourceEvidence[] };

export interface CatalogEvidence {
  identity: VerifiedFact<{ model_id: string; name: string; fixture_class: FixtureClass }>;
  dimensions: VerifiedFact<DimMm>;
  price: VerifiedFact<{ base: number; byFinish?: Record<string, number> }> | { status: "estimated"; note: string };
  planningNote: string;
}

export interface SKU {
  model_id: string;
  name: string;
  category: Category;
  fixture_class: FixtureClass;
  dim: DimMm;
  finish_options: string[];
  price: number;
  priceByFinish?: Record<string, number>;
  image_ref?: string;
  geometry_descriptor: GeometryDescriptor;
  water?: WaterMeta;
  feature_tags: FeatureTag[];
  compatibility: string[];
  substitutionIds?: string[];
  evidence?: CatalogEvidence;
}

export interface QuarantineRecord {
  model_id: string;
  reason: QuarantineReason;
  detail: string;
}

export interface LoadReport {
  loadedCount: number;
  quarantinedCount: number;
  dataGaps: string[];
  records: QuarantineRecord[];
  catalogVersion: string;
  snapshotId: string;
  catalogHash: string;
}

export interface CatalogState {
  skus: SKU[];
  compatibilityGraph: Map<string, string[]>;
  substitutes: Map<string, string[]>;
  dataGaps: string[];
}

/** SCHEMA §7.3 — central veto edges (force edges live per-SKU on `SKU.compatibility`). */
export interface CompatOverrides {
  vetoes: [string, string][];
}
