// Deterministic configuration — the single source of truth for rule values, weights,
// anchors, slot size, and search budgets (SYS-ARCH §5.4, OPT §5/§6.1/§7/§9/§13.3).
// All values are hand-reviewable; changes to accepted rule values require escalation.

import type { Scores } from "../contracts/candidate.js";
import type { Priority, Spaciousness } from "../contracts/vocab.js";
import type { Config, ArchetypeTemplate } from "./config-types.js";
import { RULES } from "./rules.js";
import { EPSILON_MM } from "../contracts/canonical.js";

/** Priority weight tables (OPT §6.1). Each row sums to exactly 1.0.
 *  Hand-tuned, planning-level — pending product audit. */
export const WEIGHTS: Record<Priority, Scores> = {
  value: { uCost: 0.45, uSpace: 0.2, uWater: 0.1, uLuxury: 0.05, uMaintenance: 0.2 },
  balanced: { uCost: 0.25, uSpace: 0.25, uWater: 0.15, uLuxury: 0.15, uMaintenance: 0.2 },
  luxury: { uCost: 0.1, uSpace: 0.15, uWater: 0.1, uLuxury: 0.45, uMaintenance: 0.2 },
  "eco-low-maintenance": {
    uCost: 0.1,
    uSpace: 0.15,
    uWater: 0.4,
    uLuxury: 0.05,
    uMaintenance: 0.3,
  },
};

/** Bounded spaciousness modifier on the space-term weight ONLY (ADR-006). The modified
 *  weight is clamped to [1/bound × base, bound × base] and the row is re-normalized. */
export const SPACIOUSNESS_MODIFIER: Record<Spaciousness, number> = {
  compact: 0.8,
  balanced: 1.0,
  airy: 1.25,
};

/** Anchored normalization references (OPT §7). Each anchor is a single config entry with
 *  rationale so scores stay stable, comparable, and narratable. Planning-level defaults —
 *  pending product audit. */
export const ANCHORS = {
  ecoGoldWater: {
    toiletFlushL: 4.0,
    basinFlowLpm: 5.0,
    showerFlowLpm: 7.5,
    rationale: "Eco-gold target for combined water use (u_water ideal = 1.0).",
  },
  luxuryMaxPoints: {
    value: 100,
    rationale: "Upper anchor of the finish/smart-feature/brand-tier point scale.",
  },
  maintenanceMaxPoints: {
    value: 100,
    rationale: "Upper anchor of the wear-resistance/simplicity point scale.",
  },
} as const;

/** Archetype templates (OPT §8.1). Hand-authored planning-level tables — pending
 *  product audit. Taste (preferredClasses/classCountRanges) + room + budget filter
 *  these per solve; classCountRanges are the authoritative count bounds. */
export const ARCHETYPES: ArchetypeTemplate[] = [
  {
    id: "compact-guest",
    label: "Compact guest",
    classCountRanges: { toilet: { min: 1, max: 1 }, basin: { min: 1, max: 1 }, faucet: { min: 1, max: 1 } },
  },
  {
    id: "budget-family",
    label: "Budget family",
    classCountRanges: {
      toilet: { min: 1, max: 1 },
      basin: { min: 1, max: 1 },
      faucet: { min: 1, max: 1 },
      shower: { min: 1, max: 1 },
      tub: { min: 0, max: 1 },
    },
  },
  {
    id: "spa-master",
    label: "Spa master",
    classCountRanges: {
      toilet: { min: 1, max: 1 },
      basin: { min: 1, max: 2 },
      faucet: { min: 1, max: 2 },
      shower: { min: 1, max: 2 },
      vanity: { min: 0, max: 1 },
    },
  },
  {
    id: "full-luxury",
    label: "Full / Luxury",
    classCountRanges: {
      toilet: { min: 1, max: 1 },
      basin: { min: 1, max: 2 },
      faucet: { min: 1, max: 2 },
      shower: { min: 1, max: 2 },
      tub: { min: 1, max: 1 },
      vanity: { min: 1, max: 1 },
      accessory: { min: 0, max: 2 },
    },
  },
];

export const DEFAULT_CONFIG: Config = {
  rules: RULES,
  weights: WEIGHTS,
  spaciousnessModifier: SPACIOUSNESS_MODIFIER,
  spaciousnessModBound: 1.25,
  anchors: ANCHORS,
  slotGridMm: 25, // OPT §4/§9 default grid
  backtrackBudget: 10000, // bounded search; exhaustion routes to relaxation (OPT §9/§17)
  topK: 3, // OPT §12: k ≥ 3
  minBudgetInr: 50000, // MIN_BUDGET gate — planning-level default, pending product audit
  archetypes: ARCHETYPES,
  epsilonMm: EPSILON_MM,
};
