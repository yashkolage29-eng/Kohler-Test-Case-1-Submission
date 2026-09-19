// Input contracts — mirrors SYS-ARCH §5.4 and OPT §2. The solver never runs on
// unconfirmed input (confirmed === false blocks at the Step-01 gate, OPT §13.1).

import type { RoomPolygon, Opening } from "./geometry.js";
import type {
  FeatureTag,
  FinishFamily,
  FixtureClass,
  Priority,
  Spaciousness,
} from "./vocab.js";
import type { Config } from "../config/config-types.js";
import type { ProductType } from "../catalog/traits.js";

/** Budget ceilings (OPT §2.5): bMax is the hard ceiling, relaxable only via the explicit
 *  relaxation path (ADR-015); bTarget is the soft preferred-spend signal driving u_cost.
 *  INR integers (SCHEMA §2.1). */
export interface Budget {
  bMax: number;
  bTarget: number;
}

export interface ClassCountRange {
  min: number;
  max: number;
}

/** Taste → feature-constraint set (OPT §2.3). Produced by the AI layer or the offline
 *  fallback; once produced it is a deterministic input — the engine is bound to respect
 *  it and the AI has no further vote (ADR-002). */
export interface FeatureConstraints {
  requiredFeatures: FeatureTag[];
  preferredClasses: FixtureClass[];
  finishFamilies: FinishFamily[];
  /** Free-text tone/flavor from the AI taste read; narration-only, never a constraint. */
  tone?: string;
  classCountRanges: Partial<Record<FixtureClass, ClassCountRange>>;
  /** Preferred product form per class, e.g. from a style preset (T-028). Each narrows its
   *  class binding pool; when no valid plan uses them the solve drops them one class at a
   *  time (tub, toilet, faucet, basin) — a preference, never a constraint. */
  preferredTypes?: Partial<Record<FixtureClass, ProductType>>;
}

/** The formal solver input set I (SYS-ARCH §5.4 seed mirrored; `featureConstraints`
 *  concretized from `string[]` to the structured OPT §2.3 form — recorded in ADR-022). */
export interface InputSet {
  polygon: RoomPolygon;
  openings: Opening[];
  confirmed: boolean;
  featureConstraints: FeatureConstraints;
  priority?: Priority;
  spaciousness?: Spaciousness;
  budget: Budget;
  config: Config;
}
