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
  /** T-032: a reduced template (no shower) that the solver skips by default; only the
   *  labeled drop-shower relaxation path enables it for rooms too small for a shower. */
  fallback?: boolean;
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
  /** T-032: u_cost at zero spend and at B_target per priority; linear in between, then
   *  linear from `atTarget` down to 0 at B_max. atZero < atTarget pulls spend toward the
   *  target; atZero > atTarget rewards savings; equal values are flat. `pivot: "max"`
   *  (T-041) moves the peak from B_target to B_max, so that priority leans to the top of
   *  the range. */
  costCurve: Record<Priority, { atZero: number; atTarget: number; pivot?: "max" }>;
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
