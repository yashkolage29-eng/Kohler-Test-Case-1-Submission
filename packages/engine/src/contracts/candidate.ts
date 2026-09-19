// Candidate contracts — mirrors SYS-ARCH §5.2. A Candidate is assembled by the solver
// (T-008) and is valid by construction; validity flags here are measured facts, not hopes.

import type { ZoneKind } from "./geometry.js";
import type { FeatureTag, FixtureClass } from "./vocab.js";

export interface Fixture {
  skuId: string;
  class: FixtureClass;
  footprintMm: { w: number; d: number; h: number };
  /** Preferred zone kinds (e.g. plumbing wall for WC/basin) — zone KINDS, not placed
   *  Zone instances (SYS-ARCH §5.2 leaves this informal; zones are spans, affinity is a
   *  class-level preference). */
  classAffinity: ZoneKind[];
  orientation: number; // degrees
  featureTags: FeatureTag[];
  zones: ZoneKind[];
}

export interface FixtureBinding {
  fixture: Fixture;
  wallStripId: string;
  posAlongMm: number;
  orientation: number; // degrees
}

export interface Candidate {
  /** Deterministic candidate identity: canonical join of sorted bound SKU ids.
   *  Used by receipts, tie-breaks and caching (addition over the §5.2 seed, which has no
   *  identity field but requires lexicographic tie-breaks, OPT §13.3). */
  id: string;
  classSet: string[];
  bindings: FixtureBinding[];
  cost: number; // INR integer
  clearanceDeltas: Record<string, number>;
  compatOk: boolean;
  geometryValid: boolean;
}

/** The five anchored utility terms (OPT §6), each in [0,1]. No vibe terms. */
export interface Scores {
  uCost: number;
  uSpace: number;
  uWater: number;
  uLuxury: number;
  uMaintenance: number;
}

export interface CandidateScore {
  candidateId: string;
  total: number;
  perTerm: Scores;
}
