// Top-level solve (T-009/T-010): constructive solver gate → deterministic finish
// resolution → anchored scoring → ranking → Plan assembly; typed infeasibility →
// fail-cause diagnosis → hand-ordered relaxation menu (1–3 independently re-searched
// and fully re-validated plans) or the honest out-of-scope wall (OPT §10.2, ADR-020
// mode 2). Ordinary-brief alternative priority profiles are the separate ADR-020
// mode-1 route — see relax/alternatives.ts, never this function. Deterministic pure
// function of InputSet + CatalogState (OPT §14). No UI, no network.
import type { InputSet } from "../contracts/input.js";
import type { BathroomRep } from "../contracts/geometry.js";
import type { BuildOutput, OutOfScope, Plan } from "../contracts/plan.js";
import type { CatalogState } from "../catalog/schema.js";
import type { Config } from "../config/config-types.js";
import type { FixtureClass } from "../contracts/vocab.js";
import type { Candidate } from "../contracts/candidate.js";
import type { Scores } from "../contracts/candidate.js";
import { buildBathroomRep } from "../geometry/room.js";
import { polygonSignedAreaMm2 } from "../geometry/polygon.js";
import { runConstructiveSolver } from "../solver/solve.js";
import { ONE_OF_GROUPS, missingOneOf } from "../solver/archetypes.js";
import { resolveFinishes, type ResolvedFinishes } from "./finish.js";
import { resolveWeights, scoreCandidate } from "./scores.js";
import { rankCandidates, scoreWithWeights, topK } from "./rank.js";
import { buildPlan } from "./build-plan.js";
import { diagnoseFailures } from "../relax/diagnose.js";
import { buildRelaxationMenu } from "../relax/relax.js";
import { cachedValidatedCandidates } from "../cache/cache.js";

/** Full solve pipeline up to a Plan, without the relaxation protocol (the relaxation
 *  paths re-search through THIS function — full-validator-on-every-output by
 *  construction; T-010). */
export type SolvePlanResult =
  | { kind: "plan"; plan: Plan }
  | { kind: "infeasible"; reason: string; blockers: string[] }
  | { kind: "gate-blocked"; reasons: string[] };

/** The validated, finish-resolved candidate set for an input — shared by solvePlan
 *  (argmax → Plan) and relax/alternativeProfiles (per-profile re-scores, T-010). */
export type ValidatedCandidates =
  | {
      kind: "ok";
      candidates: Candidate[];
      resolvedPairs: { candidate: Candidate; resolved: ResolvedFinishes }[];
      rep: BathroomRep;
    }
  | { kind: "infeasible"; reason: string; blockers: string[] }
  | { kind: "gate-blocked"; reasons: string[] };

/** Budget values are user-derived input and must satisfy the contract before
 * canonicalization or arithmetic. Invalid values are input repair, not a
 * relaxation opportunity. */
export function budgetInputErrors(input: InputSet): string[] {
  const errors: string[] = [];
  for (const [name, value] of Object.entries(input.budget)) {
    if (!Number.isFinite(value)) errors.push(`non-finite-budget:${name}`);
    else if (!Number.isInteger(value) || value < 0) errors.push(`invalid-budget:${name}`);
  }
  return errors;
}

/** Honest out-of-scope wall (OPT §10.2.4): final blocker + minimum viable cost. */
function outOfScope(finalBlocker: string, minViableCost: number): BuildOutput {
  const scope: OutOfScope = { finalBlocker, minViableCost };
  return { kind: "out-of-scope", outOfScope: scope };
}

/**
 * Deterministic minimum-viable-cost estimate (OPT §10.2.4/§13.3): cheapest catalog
 * SKU price per class × each archetype's minimum counts, minimized over the config
 * archetype templates. It measures COST only — compatibility and placement failures
 * are blockers, not cost — and is documented as an estimate, per T-009 scope.
 */
export function minViableCost(config: Config, catalog: CatalogState): number {
  const cheapest = new Map<FixtureClass, number>();
  for (const sku of catalog.skus) {
    const current = cheapest.get(sku.fixture_class);
    if (current === undefined || sku.price < current) cheapest.set(sku.fixture_class, sku.price);
  }
  let min = Number.POSITIVE_INFINITY;
  for (const archetype of config.archetypes) {
    if (archetype.fallback === true) continue; // T-032: reached only via drop-shower
    let cost = 0;
    let complete = true;
    for (const [cls, range] of Object.entries(archetype.classCountRanges)) {
      if (range.min === 0) continue; // optional class — neither costed nor required
      const price = cheapest.get(cls as FixtureClass);
      if (price === undefined) {
        complete = false; // class with no catalog SKUs — archetype not costable
        break;
      }
      cost += price * range.min;
    }
    // T-032/T-036: one sink and one shower-or-tub are mandatory even when optional per class.
    for (const group of ONE_OF_GROUPS) {
      if (missingOneOf(archetype.classCountRanges, group) === 0) continue;
      const price = Math.min(...group.map((cls) => cheapest.get(cls) ?? Infinity));
      if (Number.isFinite(price)) cost += price;
      else complete = false; // no SKU of the group at all — archetype not costable
    }
    if (complete && cost < min) min = cost;
  }
  return Number.isFinite(min) ? min : 0;
}

/** Collect the validated, finish-resolved candidate set (solver gate → finish
 *  resolution BEFORE scoring — the T-009 gap: u_cost/C8 must see the true
 *  priceByFinish-resolved cost; over-ceiling candidates drop here). */
export function validatedCandidates(input: InputSet, catalog: CatalogState): ValidatedCandidates {
  // T-032: the sink defaults to a vanity (cabinet + top + integrated basin) so the basin
  // never floats. A standalone basin is used when a style prefers a basin form, when the
  // taste pins the basin/vanity count, or when no vanity plan fits the room/budget.
  const fc = input.featureConstraints;
  const sinkPinned = fc.classCountRanges.basin !== undefined || fc.classCountRanges.vanity !== undefined;
  if (!sinkPinned && Math.abs(polygonSignedAreaMm2(input.polygon.vertices)) >= DOUBLE_SINK_MIN_AREA_MM2) {
    // T-043: a big room first tries two standalone basins (each with its own faucet).
    const double = withPreferenceFallback(
      { ...input, featureConstraints: { ...fc, classCountRanges: { ...fc.classCountRanges, basin: { min: 2, max: 2 }, vanity: { min: 0, max: 0 } } } },
      catalog,
    );
    if (double.kind !== "infeasible") return double;
  }
  if (!sinkPinned) {
    const sink = fc.preferredTypes?.basin === undefined
      ? { basin: { min: 0, max: 0 }, vanity: { min: 1, max: 1 } }
      : { vanity: { min: 0, max: 0 } };
    const sinkFirst = withPreferenceFallback(
      { ...input, featureConstraints: { ...fc, classCountRanges: { ...fc.classCountRanges, ...sink } } },
      catalog,
    );
    if (sinkFirst.kind !== "infeasible") return sinkFirst;
  }
  return withPreferenceFallback(input, catalog);
}

/** T-043: floor area (9 m²) from which an Auto sink becomes two basins when they fit and are affordable. */
const DOUBLE_SINK_MIN_AREA_MM2 = 9_000_000;

function withPreferenceFallback(input: InputSet, catalog: CatalogState): ValidatedCandidates {
  let result = collectValidated(input, catalog);
  // Preferred product types are a preference, not a constraint (T-028): while infeasible,
  // drop them one class at a time, the most space-hungry first.
  let preferred = input.featureConstraints.preferredTypes;
  for (const cls of PREFERENCE_DROP_ORDER) {
    if (result.kind !== "infeasible" || preferred === undefined) break;
    if (preferred[cls] === undefined) continue;
    const rest = { ...preferred };
    delete rest[cls];
    preferred = Object.keys(rest).length > 0 ? rest : undefined;
    result = collectValidated({ ...input, featureConstraints: { ...input.featureConstraints, preferredTypes: preferred } }, catalog);
  }
  return result;
}

const PREFERENCE_DROP_ORDER: FixtureClass[] = ["tub", "toilet", "faucet", "basin", "shower", "vanity", "accessory"];

function collectValidated(input: InputSet, catalog: CatalogState): ValidatedCandidates {
  const result = runConstructiveSolver(input, catalog);
  if (result.kind === "gate-blocked") return result;
  if (result.kind === "infeasible") return result;

  const rep = buildBathroomRep(input);
  if (!rep.ok) {
    // Unreachable via the solver gate (it re-builds the same rep) — kept typed.
    return { kind: "infeasible", reason: "invalid-input", blockers: rep.reasons };
  }
  const resolvedPairs: { candidate: Candidate; resolved: ResolvedFinishes }[] = [];
  for (const candidate of result.candidates) {
    const resolved = resolveFinishes(candidate, input, catalog);
    if (resolved !== null) resolvedPairs.push({ candidate, resolved });
  }
  if (resolvedPairs.length === 0) {
    return { kind: "infeasible", reason: "no-finish-consistent-candidate", blockers: [] };
  }
  return { kind: "ok", candidates: result.candidates, resolvedPairs, rep: rep.rep };
}

/** Deterministic pipeline up to the Plan (OPT §8.4/§12): weights = priority profile +
 *  bounded spaciousness modifier (ADR-006); undefined knobs use the documented
 *  defaults. Full C1–C8 re-measure happens in buildPlan — nothing unvalidated escapes. */
export function solvePlan(input: InputSet, catalog: CatalogState): SolvePlanResult {
  const budgetErrors = budgetInputErrors(input);
  if (budgetErrors.length > 0) {
    return { kind: "infeasible", reason: "invalid-input", blockers: budgetErrors };
  }
  const collected = cachedValidatedCandidates(input, catalog);
  if (collected.kind !== "ok") return collected;
  const { resolvedPairs, rep } = collected;

  const { weights } = resolveWeights(input.config, input.priority, input.spaciousness);
  const scored = resolvedPairs.map(({ candidate, resolved }) =>
    scoreWithWeights(candidate, scoreCandidate(candidate, resolved, input, catalog), weights),
  );
  const ranked = rankCandidates(scored);
  const best = ranked[0];
  const bestPair = resolvedPairs.find((p) => p.candidate.id === best.candidate.id);
  if (bestPair === undefined) {
    return { kind: "infeasible", reason: "rank-inconsistency", blockers: [] };
  }

  const receiptTopK = topK(ranked, input.config);
  const scoreMatrix: Record<string, Scores> = {};
  for (const s of ranked) scoreMatrix[s.candidate.id] = s.scores;

  const plan = buildPlan({
    best,
    resolved: bestPair.resolved,
    input,
    catalog,
    rep,
    topK: receiptTopK,
    scoreMatrix,
  });
  return { kind: "plan", plan };
}

/** Whole pipeline (SYS-ARCH §6.1 solve): the ONLY engine entry for a fresh brief.
 *  Infeasible briefs route through the ADR-020 mode-2 relaxation protocol: fail-cause
 *  diagnosis → hand-ordered, independently re-searched and re-validated relaxation
 *  paths → 1–3 distinct valid plans, or the honest out-of-scope wall (OPT §10.2). */
export function solve(input: InputSet, catalog: CatalogState): BuildOutput {
  const result = solvePlan(input, catalog);

  if (result.kind === "plan") return result;

  // Gate-blocked (Step-01, OPT §13.1): BuildOutput has no gate kind — the typed
  // blocker propagates through the honest out-of-scope wall (documented; repair of
  // an unconfirmed brief is user input flow, not constraint relaxation).
  if (result.kind === "gate-blocked") {
    return outOfScope(`gate-blocked:${result.reasons.join(";")}`, 0);
  }

  // Malformed geometry (invalid-input) is likewise input repair, not relaxation —
  // every relaxation path would rebuild the same invalid rep.
  if (result.reason === "invalid-input") {
    return outOfScope(
      `invalid-input:${result.blockers.join(";")}`,
      minViableCost(input.config, catalog),
    );
  }

  const diagnosis = diagnoseFailures(input, catalog, result.reason, result.blockers);
  return buildRelaxationMenu(input, catalog, diagnosis, (relaxed) => solvePlan(relaxed, catalog));
}
