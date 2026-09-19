// SKU binding (OPT §8.2): within an archetype's effective count ranges ∪ the
// feature-constraint set, pick exact SKUs that satisfy C7 pair compatibility
// (curated graph membership, pair-level) and the C8 budget ceiling with
// cost-aware pruning (pools pre-sorted cheapest-first; branches are killed as
// soon as partial cost + cheapest possible remainder exceeds B_max). Budget is
// enforced ARITHMETICALLY here — the C8 RuleVerdict evaluator is T-009 scope.
// Deterministic: pools sorted by (price, model_id); classes in closed vocab
// order; count vectors ascending. Binding pairs use distinct SKUs: the curated
// graph has no self-edges, so a repeated SKU can never pass pair-level C7.
// Pure functions only.
import type { InputSet } from "../contracts/input.js";
import type { FixtureClass } from "../contracts/vocab.js";
import { FIXTURE_CLASSES } from "../contracts/vocab.js";
import type { CatalogState, SKU } from "../catalog/schema.js";
import type { ArchetypeTemplate } from "../config/config-types.js";
import { FINISHES } from "../catalog/data/finishes.js";
import type { FeatureTag } from "../contracts/vocab.js";
import { effectiveCountRange } from "./archetypes.js";
import { productType } from "../catalog/traits.js";

/** Planning-level cap on SKU-sets enumerated per count vector (pending audit). */
export const MAX_SKU_SETS_PER_VECTOR = 64;
/** Planning-level cap on count vectors explored per archetype. */
export const MAX_COUNT_VECTORS = 16;

function pairCompatible(graph: CatalogState["compatibilityGraph"], a: SKU, b: SKU): boolean {
  return graph.get(a.model_id)?.includes(b.model_id) ?? false;
}

/** SKUs usable for binding of `cls`: surviving, class-matched, graph members; sorted
 *  cheapest-first with tag/family-covering SKUs ahead of non-covering ones (cost-aware
 *  pruning order). Finish families are a plan-level coverage requirement (≥1 bound SKU
 *  offers a chosen family), not a per-SKU filter — a taste finish is an accent the user
 *  wants to see in the plan, and filtering pools per-SKU wrongly empties classes (e.g.
 *  stone-only vanities under a brushed-nickel taste). Sorted by (covers, price, id). */
export function bindingPool(catalog: CatalogState, input: InputSet, cls: FixtureClass): SKU[] {
  const families = new Set<string>(input.featureConstraints.finishFamilies);
  const familyByFinishId = new Map(FINISHES.map((finish) => [finish.id, finish.family] as const));
  const required = new Set<FeatureTag>(input.featureConstraints.requiredFeatures as FeatureTag[]);
  let pool: SKU[] = [];
  for (const sku of catalog.skus) {
    if (sku.fixture_class !== cls) continue;
    if (!catalog.compatibilityGraph.has(sku.model_id)) continue;
    pool.push(sku);
  }
  // Style preference (T-028): keep only the preferred form when the catalog has it.
  const preferred = input.featureConstraints.preferredTypes?.[cls];
  if (preferred !== undefined) {
    const styled = pool.filter((sku) => productType(sku) === preferred);
    if (styled.length > 0) pool = styled;
  }
  const covers = (sku: SKU): boolean =>
    [...required].some((tag) => sku.feature_tags.includes(tag));
  pool.sort(
    (a, b) =>
      (covers(b) ? 1 : 0) - (covers(a) ? 1 : 0) ||
      a.price - b.price ||
      (a.model_id < b.model_id ? -1 : a.model_id > b.model_id ? 1 : 0),
  );
  return pool;
}

/** Per-class count vectors for an archetype, ascending by total then lexicographic. */
export function countVectors(arch: ArchetypeTemplate, input: InputSet): FixtureClass[][] {
  const active: { cls: FixtureClass; min: number; max: number }[] = [];
  for (const cls of FIXTURE_CLASSES) {
    const range = effectiveCountRange(arch, input, cls);
    if (range && range.max > 0) active.push({ cls, min: range.min, max: range.max });
  }
  const vectors: FixtureClass[][] = [];
  const build = (i: number, acc: FixtureClass[]) => {
    if (vectors.length >= MAX_COUNT_VECTORS) return;
    if (i === active.length) {
      vectors.push([...acc]);
      return;
    }
    const { min, max } = active[i];
    for (let n = min; n <= max; n++) {
      if (vectors.length >= MAX_COUNT_VECTORS) return;
      acc.push(...Array<FixtureClass>(n).fill(active[i].cls));
      build(i + 1, acc);
      acc.length -= n;
    }
  };
  build(0, []);
  vectors.sort((a, b) => a.length - b.length || (a.join(",") < b.join(",") ? -1 : 1));
  return vectors;
}

/**
 * Enumerate cost-pruned, pair-compatible SKU sets for one archetype. Order:
 * count vectors ascending (fewest fixtures first — cost-aware), pools
 * cheapest-first. Hard budget `bMax` enforced arithmetically (T-009 owns the
 * C8 evaluator). `budget.nodes` is decremented per search node (shared,
 * deterministic exhaustion signal); `maxSets` bounds output size.
 */
export function bindSkus(
  arch: ArchetypeTemplate,
  input: InputSet,
  catalog: CatalogState,
  budget: { nodes: number },
  maxSets: number = MAX_SKU_SETS_PER_VECTOR,
): SKU[][] {
  const graph = catalog.compatibilityGraph;
  const required = [...input.featureConstraints.requiredFeatures].sort();
  const families = new Set<string>(input.featureConstraints.finishFamilies);
  const familyByFinishId = new Map(FINISHES.map((finish) => [finish.id, finish.family] as const));
  const classes = FIXTURE_CLASSES.filter(
    (cls) => (effectiveCountRange(arch, input, cls)?.max ?? 0) > 0,
  );
  const pools = new Map(classes.map((cls) => [cls, bindingPool(catalog, input, cls)] as const));
  const vectors = countVectors(arch, input);

  // A required tag no pool SKU carries makes every binding infeasible.
  for (const tag of required) {
    const covered = [...pools.values()].some((pool) =>
      pool.some((s) => s.feature_tags.includes(tag)),
    );
    if (!covered) return [];
  }

  const out: SKU[][] = [];
  const bMax = input.budget.bMax;
  for (const vector of vectors) {
    const counts = new Map<string, number>();
    for (const cls of vector) counts.set(cls, (counts.get(cls) ?? 0) + 1);
    const active = classes.filter((cls) => (counts.get(cls) ?? 0) > 0);

    // Suffix min costs: cheapest possible remainder for classes i..end.
    const suffixMin = new Array<number>(active.length + 1).fill(0);
    for (let i = active.length - 1; i >= 0; i--) {
      const pool = pools.get(active[i]) as SKU[];
      const n = counts.get(active[i]) as number;
      const cheapest = pool.slice(0, n);
      suffixMin[i] =
        cheapest.length === n
          ? cheapest.reduce((t, s) => t + s.price, 0) + suffixMin[i + 1]
          : Number.POSITIVE_INFINITY; // not enough pool SKUs for the count
    }

    const chosen: SKU[] = [];
    const enumClass = (i: number, cost: number) => {
      if (budget.nodes <= 0 || out.length >= maxSets) return;
      if (i === active.length) {
        // Feature-constraint coverage: required tags carried by the bound set, and at
        // least one bound SKU offering a finish from the chosen families (plan-level
        // coverage; see bindingPool — NOT a per-SKU finish filter).
        const tags = new Set(chosen.flatMap((s) => s.feature_tags));
        if (!required.every((tag) => tags.has(tag))) return;
        if (families.size > 0 && !chosen.some((s) => s.finish_options.some((finishId) => families.has(familyByFinishId.get(finishId) ?? finishId)))) return;
        out.push([...chosen].sort((a, b) => (a.model_id < b.model_id ? -1 : 1)));
        return;
      }
      if (cost + suffixMin[i] > bMax) return; // cost-aware pruning
      budget.nodes -= 1;
      const cls = active[i];
      const n = counts.get(cls) as number;
      const pool = pools.get(cls) as SKU[];
      const pick = (start: number, picked: SKU[], pickedCost: number) => {
        if (picked.length === n) {
          chosen.push(...picked);
          enumClass(i + 1, cost + pickedCost);
          chosen.length -= n;
          return;
        }
        for (let j = start; j + (n - picked.length) <= pool.length; j++) {
          if (budget.nodes <= 0 || out.length >= maxSets) return;
          budget.nodes -= 1;
          const sku = pool[j];
          if (cost + pickedCost + sku.price > bMax) break; // pool is price-ascending
          // Pair-level C7 pruning: must be compatible with every chosen SKU.
          if (!chosen.every((c) => pairCompatible(graph, sku, c))) continue;
          if (!picked.every((c) => pairCompatible(graph, sku, c))) continue;
          picked.push(sku);
          pick(j + 1, picked, pickedCost + sku.price);
          picked.pop();
        }
      };
      pick(0, [], 0);
    };
    enumClass(0, 0);
    if (out.length >= maxSets || budget.nodes <= 0) break;
  }
  return out;
}
