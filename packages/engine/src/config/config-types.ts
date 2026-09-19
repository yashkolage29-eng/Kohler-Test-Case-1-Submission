// Config type — separated from the values so contracts can import the type without
// importing the (mutable-by-growth) value module.

import type { Scores } from "../contracts/candidate.js";
import type { ClassCountRange } from "../contracts/input.js";
import type { FixtureClass, Priority, Spaciousness } from "../contracts/vocab.js";
import type { RuleConfig } from "./rules.js";

/** Archetype template (OPT §8.1): per-class count ranges over the closed class set. */
export interface ArchetypeTemplate {
  id: string;
  label: string;
  classCountRanges: Partial<Record<FixtureClass, ClassCountRange>>;
}

export interface Anchors {
  ecoGoldWater: {
    toiletFlushL: number;
    basinFlowLpm: number;
    showerFlowLpm: number;
    rationale: string;
  };
  luxuryMaxPoints: { value: number; rationale: string };
  maintenanceMaxPoints: { value: number; rationale: string };
}

export interface Config {
  rules: Record<string, RuleConfig>;
  weights: Record<Priority, Scores>;
  /** Bounded modifier on the space-term weight only (ADR-006). */
  spaciousnessModifier: Record<Spaciousness, number>;
  spaciousnessModBound: number;
  anchors: Anchors;
  slotGridMm: number;
  /** Bounded backtracking budget; exhaustion routes to relaxation, never a hang. */
  backtrackBudget: number;
  /** Receipt top-k size; OPT §12 requires k ≥ 3. */
  topK: number;
  /** MIN_BUDGET gate (OPT §13.3) — below this, honest out-of-scope with min viable cost. */
  minBudgetInr: number;
  /** Archetype templates (OPT §8.1); taste/room/budget filter them per solve. */
  archetypes: ArchetypeTemplate[];
  epsilonMm: number;
}
