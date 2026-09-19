// Public entry of @kolher/engine: the ONE explicit cross-package contract + config
// (ADR-001/011, T-002). Web and server import from here; nothing else is public API.

export const ENGINE_CONTRACT_VERSION = "0.1.0";
export * from "./drafts.js";
export * from "./decor.js";
export * from "./styles.js";

export * from "./contracts/geometry.js";
export * from "./contracts/vocab.js";
export * from "./contracts/input.js";
export * from "./contracts/candidate.js";
export * from "./contracts/plan.js";
export * from "./contracts/receipt.js";
export * from "./contracts/render.js";
export * from "./contracts/engine.js";
export * from "./contracts/canonical.js";
export * from "./catalog/index.js";
export * from "./solver/index.js";
export * from "./objective/index.js";
export * from "./relax/index.js";
export * from "./cache/index.js";
export * from "./render/index.js";
// T-014: geometry helpers consumed by the renderer (and available to web/server) —
// pre-approved TODO in engine index ("export when T-014 first consumes them").
export {
  aabbForPlacement,
  aabbIntersectsMm,
  pointInPolygonMm,
  aabbInsidePolygonMm,
} from "./geometry/aabb.js";
export type { AabbResult } from "./geometry/aabb.js";
export {
  buildWallStrips,
  stripPoint,
  stripLengthMm,
  stripInwardNormal,
  rangesIntersectMm,
} from "./geometry/strips.js";
export { normalizeRoomPolygon, polygonSignedAreaMm2 } from "./geometry/polygon.js";
export type { PolygonResult } from "./geometry/polygon.js";

// T-015: finishes table consumed by the web 3D renderer for finish→material mapping
// (render = catalog geometry; the finish color comes from the catalog row, never UI).
export { FINISHES } from "./catalog/data/finishes.js";

export type { Config, Anchors, ArchetypeTemplate } from "./config/config-types.js";
export { DEFAULT_CONFIG, WEIGHTS, SPACIOUSNESS_MODIFIER, ANCHORS } from "./config/config.js";
export { RULES } from "./config/rules.js";
export type { RuleConfig } from "./config/rules.js";

