// Anchored utilities (OPT §6/§7): five deterministic terms, each u∈[0,1], every anchor
// value read from config (§7: single source of truth with rationale). The engine adds
// no vote to any term (OPT §6, ADR-014).
//
// Anchoring per term (§7 — absolute/anchored where a defensible reference exists):
// - u_cost: anchored on B_target (ideal) vs B_max (worst). At or below target → 1.0:
//   the target is the IDEAL, savings below it are not penalized (the anchored form of
//   OPT §6.1's "reward closeness to B_target").
// - u_space: spare-floor fraction = (room area − Σ placed footprint area) / room area.
//   Inherently anchored on [0,1] (0 = min-fit, 1 = fully spare) — NO within-set min/max
//   normalization is used, which §7 permits only where no external anchor exists, so
//   scores are candidate-set-size independent (§18.5).
// - u_water: combined flow/flush of bound wet fixtures (faucet+shower Lpm, toilet
//   flush L). Ideal = Σ per-class eco-gold anchors (config ANCHORS.ecoGoldWater; the
//   faucet uses the lavatory `basinFlowLpm` anchor — OPT §6 names "basins L/min" for
//   the lavatory term). Worst = Σ per-class worst catalog value — a CATALOG anchor,
//   not a candidate-set anchor, so it is also set-size independent.
// - u_luxury: per fixture, integer points = 20 × finish luxuryPoints (SCHEMA §4,
//   1–3) + 10 × premium-feature-tag count (capped at 4), capped at the anchor value.
//   Set-level score = mean of per-fixture points ÷ ANCHORS.luxuryMaxPoints.value.
// - u_maintenance: per fixture, integer points = 10 × finish wearResistance (§4,
//   1–5) + simplicity bonus max(0, 50 − 10 × complexity-tag count, capped at 5),
//   capped at the anchor value. Mean ÷ ANCHORS.maintenanceMaxPoints.value.
//   The 20/10/50 point coefficients are engine constants of the point scale (the
//   ANCHORS stay the normalization denominators); flagged for product audit
//   alongside the anchors themselves.
import type { Candidate, Scores } from "../contracts/candidate.js";
import type { InputSet } from "../contracts/input.js";
import type { CatalogState, SKU } from "../catalog/schema.js";
import type { Config } from "../config/config-types.js";
import type { FeatureTag, FixtureClass, Priority, Spaciousness } from "../contracts/vocab.js";
import { polygonSignedAreaMm2 } from "../geometry/polygon.js";
import type { ResolvedFinishes } from "./finish.js";
import { finishOf } from "./finish.js";

/** Documented config defaults when the steering knobs are undefined on InputSet
 *  (OPT §6.1 spelling: "balance" resolves to the "balanced" weight row — ADR-022). */
export const DEFAULT_PRIORITY: Priority = "balanced";
export const DEFAULT_SPACIOUSNESS: Spaciousness = "balanced";

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Premium-feature tags for u_luxury (closed vocab, contracts/vocab). */
const LUXURY_TAGS: readonly FeatureTag[] = [
  "smart",
  "bidet",
  "heated_seat",
  "self_cleaning",
  "rain_shower",
  "thermostatic",
  "touchless",
];

/** Moving-parts/complexity tags for u_maintenance simplicity (closed vocab). */
const COMPLEXITY_TAGS: readonly FeatureTag[] = [
  "smart",
  "bidet",
  "heated_seat",
  "touchless",
  "thermostatic",
  "self_cleaning",
];

/** Weight row for the objective: priority profile + ADR-006 bounded spaciousness
 *  modifier on the u_space weight ONLY, then re-normalized to sum to 1. */
export function resolveWeights(
  config: Config,
  priority?: Priority,
  spaciousness?: Spaciousness,
): { priority: Priority; spaciousness: Spaciousness; weights: Scores } {
  const p = priority ?? DEFAULT_PRIORITY;
  const s = spaciousness ?? DEFAULT_SPACIOUSNESS;
  const base = config.weights[p];
  const bound = config.spaciousnessModBound;
  const raw = base.uSpace * config.spaciousnessModifier[s];
  // ADR-006: the modifier is bounded to [1/bound × base, bound × base].
  const space = Math.min(Math.max(raw, base.uSpace / bound), base.uSpace * bound);
  const row: Scores = {
    uCost: base.uCost,
    uSpace: space,
    uWater: base.uWater,
    uLuxury: base.uLuxury,
    uMaintenance: base.uMaintenance,
  };
  const sum = row.uCost + row.uSpace + row.uWater + row.uLuxury + row.uMaintenance;
  return {
    priority: p,
    spaciousness: s,
    weights: {
      uCost: row.uCost / sum,
      uSpace: row.uSpace / sum,
      uWater: row.uWater / sum,
      uLuxury: row.uLuxury / sum,
      uMaintenance: row.uMaintenance / sum,
    },
  };
}

/** Combined water draw of one SKU: flush liters for toilets, flow Lpm for the
 *  other wet classes (faucet, shower); dry classes contribute 0. */
function waterValue(sku: SKU): number {
  if (sku.fixture_class === "toilet") return sku.water?.flushLiters ?? 0;
  return sku.water?.flowRateLpm ?? 0;
}

/** Ideal per-fixture water draw from the eco-gold anchor (config, OPT §6/§7). */
function idealWater(config: Config, fixtureClass: FixtureClass): number {
  const anchor = config.anchors.ecoGoldWater;
  if (fixtureClass === "toilet") return anchor.toiletFlushL;
  if (fixtureClass === "shower") return anchor.showerFlowLpm;
  if (fixtureClass === "faucet") return anchor.basinFlowLpm; // lavatory anchor
  return 0;
}

/** Worst per-class catalog water value — catalog-anchored, set-size independent. */
function worstWaterByClass(catalog: CatalogState): Map<FixtureClass, number> {
  const worst = new Map<FixtureClass, number>();
  for (const sku of catalog.skus) {
    const value = waterValue(sku);
    const current = worst.get(sku.fixture_class);
    if (current === undefined || value > current) worst.set(sku.fixture_class, value);
  }
  return worst;
}

/** Score one finish-resolved candidate: the five anchored utilities (OPT §6). */
export function scoreCandidate(
  candidate: Candidate,
  resolved: ResolvedFinishes,
  input: InputSet,
  catalog: CatalogState,
): Scores {
  const config = input.config;
  const byId = new Map(catalog.skus.map((s) => [s.model_id, s] as const));
  const worstWater = worstWaterByClass(catalog);

  // u_cost — anchored: ideal B_target, worst B_max (OPT §6.1).
  const span = input.budget.bMax - input.budget.bTarget;
  const uCost =
    span > 0
      ? clamp01(1 - (resolved.cost - input.budget.bTarget) / span)
      : resolved.cost <= input.budget.bTarget
        ? 1
        : 0;

  // u_space — spare-floor fraction; physically anchored on [0,1] (see header).
  const roomAreaMm2 = Math.abs(polygonSignedAreaMm2(input.polygon.vertices));
  let usedMm2 = 0;
  for (const binding of candidate.bindings) {
    usedMm2 += binding.fixture.footprintMm.w * binding.fixture.footprintMm.d;
  }
  const uSpace = roomAreaMm2 > 0 ? clamp01((roomAreaMm2 - usedMm2) / roomAreaMm2) : 0;

  // u_water — combined draw vs eco-gold ideal and catalog-worst.
  let combined = 0;
  let ideal = 0;
  let worst = 0;
  for (const binding of candidate.bindings) {
    const sku = byId.get(binding.fixture.skuId);
    if (sku === undefined) continue; // dangling — resolver already rejected these
    combined += waterValue(sku);
    ideal += idealWater(config, sku.fixture_class);
    worst += worstWater.get(sku.fixture_class) ?? 0;
  }
  const uWater =
    worst > ideal ? clamp01((worst - combined) / (worst - ideal)) : combined <= ideal ? 1 : 0;

  // u_luxury / u_maintenance — integer point scales (see header).
  let luxuryPoints = 0;
  let maintenancePoints = 0;
  for (const binding of candidate.bindings) {
    const choice = resolved.choices.get(binding.fixture.skuId);
    const finish = choice === undefined ? undefined : finishOf(choice.finish);
    const tags = new Set(binding.fixture.featureTags);
    luxuryPoints += Math.min(
      config.anchors.luxuryMaxPoints.value,
      20 * (finish?.luxuryPoints ?? 0) +
        10 * Math.min(LUXURY_TAGS.filter((t) => tags.has(t)).length, 4),
    );
    maintenancePoints += Math.min(
      config.anchors.maintenanceMaxPoints.value,
      10 * (finish?.wearResistance ?? 0) +
        Math.max(0, 50 - 10 * Math.min(COMPLEXITY_TAGS.filter((t) => tags.has(t)).length, 5)),
    );
  }
  const fixtureCount = candidate.bindings.length;
  const uLuxury =
    fixtureCount > 0
      ? clamp01(luxuryPoints / fixtureCount / config.anchors.luxuryMaxPoints.value)
      : 0;
  const uMaintenance =
    fixtureCount > 0
      ? clamp01(maintenancePoints / fixtureCount / config.anchors.maintenanceMaxPoints.value)
      : 0;

  return { uCost, uSpace, uWater, uLuxury, uMaintenance };
}

/** Weighted objective total (OPT §1): Σ wᵢ · uᵢ. */
export function weightedTotal(scores: Scores, weights: Scores): number {
  return (
    weights.uCost * scores.uCost +
    weights.uSpace * scores.uSpace +
    weights.uWater * scores.uWater +
    weights.uLuxury * scores.uLuxury +
    weights.uMaintenance * scores.uMaintenance
  );
}
