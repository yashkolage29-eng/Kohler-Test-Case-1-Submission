// Candidate assembly (T-008 scope boundary): bindings + full measured
// validation → a ranking-ready Candidate. Validity flags are MEASURED facts
// from evaluateGeometryRules (C1–C6) and evaluateC7 — never hopes; a candidate
// only leaves the solver when every flag is true and the arithmetic budget
// holds (the C8 RuleVerdict evaluator is T-009 scope). Identity is the
// canonical sorted-SKU-join (contracts/candidate.ts). Pure functions only.
import type { BathroomRep } from "../contracts/geometry.js";
import type { Candidate, FixtureBinding } from "../contracts/candidate.js";
import type { InputSet } from "../contracts/input.js";
import type { CatalogState, SKU } from "../catalog/schema.js";
import { evaluateGeometryRules } from "../geometry/rules/index.js";
import { evaluateC7, c7FeatureSet } from "../rules/c7_compat.js";
import { sortBindings } from "../geometry/rules/common.js";

/** Unique SKUs of a binding list, canonical id order (distinct-SKU binding). */
function skusOf(bindings: FixtureBinding[], catalog: CatalogState): SKU[] {
  const byId = new Map(catalog.skus.map((s) => [s.model_id, s] as const));
  const ids = [...new Set(bindings.map((b) => b.fixture.skuId))].sort();
  return ids.map((id) => byId.get(id)).filter((s): s is SKU => s !== undefined);
}

/** Assemble + fully measure a candidate. Returns null when it fails any hard
 *  gate (geometry C1–C6, C7 compatibility, or the arithmetic budget ceiling). */
export function assembleCandidate(
  bindings: FixtureBinding[],
  input: InputSet,
  catalog: CatalogState,
  rep: BathroomRep,
): Candidate | null {
  const skus = skusOf(bindings, catalog);
  if (skus.length !== bindings.length) return null; // dangling binding — never emit

  const geometryVerdicts = evaluateGeometryRules(bindings, rep, input.config);
  const c7 = evaluateC7(bindings, catalog, c7FeatureSet(input.featureConstraints), input.config);
  const geometryValid = geometryVerdicts.every((v) => v.pass);
  const compatOk = c7.pass;
  const cost = skus.reduce((total, s) => total + s.price, 0);
  if (!geometryValid || !compatOk || cost > input.budget.bMax) return null;

  const c2 = geometryVerdicts.find((v) => v.ruleId === "C2");
  const clearanceDeltas: Record<string, number> = {};
  if (c2) {
    for (const [key, value] of Object.entries(c2.measuredDeltas)) {
      if (typeof value === "number") clearanceDeltas[key] = value;
    }
  }

  return {
    id: skus.map((s) => s.model_id).join("+"),
    classSet: [...new Set(skus.map((s) => s.fixture_class))].sort(),
    bindings: sortBindings(bindings),
    cost,
    clearanceDeltas,
    compatOk,
    geometryValid,
  };
}

/** Deterministic ordering signature for the ranking-ready candidate list. */
export function candidateKey(candidate: Candidate): string {
  const parts = sortBindings(candidate.bindings).map(
    (b) =>
      `${b.fixture.skuId}|${b.wallStripId}|${b.posAlongMm}|${b.orientation}`,
  );
  return `${candidate.id}|${candidate.cost}|${parts.join(";")}`;
}
