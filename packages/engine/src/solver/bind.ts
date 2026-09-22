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
import { LUXURY_TAGS } from "../objective/scores.js";

/** Planning-level cap on SKU-sets enumerated per count vector (pending audit). */
export const MAX_SKU_SETS_PER_VECTOR = 64;
/** Planning-level cap on count vectors explored per archetype. */
export const MAX_COUNT_VECTORS = 16;

function pairCompatible(graph: CatalogState["compatibilityGraph"], a: SKU, b: SKU): boolean {
  return graph.get(a.model_id)?.includes(b.model_id) ?? false;
}

/** T-032 objective axes for the themed seed sets (lower key = better on that axis). The
 *  cheapest-first enumeration alone only ever reaches the cheapest few SKUs per class,
 *  so priority/spaciousness/budget had nothing different to choose between. One greedy
 *  set per axis puts each objective's best affordable SKUs in front of the scorer.
 *  Weight-independent by construction (the candidate cache key excludes the weights). */
/** Per-fixture luxury points exactly as u_luxury scores them (finish + premium tags, max 4). */
function luxuryPoints(sku: SKU): number {
  const finish = Math.max(0, ...sku.finish_options.map((id) => FINISHES.find((f) => f.id === id)?.luxuryPoints ?? 0));
  return finish * 20 + 10 * Math.min(LUXURY_TAGS.filter((t) => sku.feature_tags.includes(t)).length, 4);
}

function themeAxes(input: InputSet): { key: (sku: SKU) => number; cap: number; sizeVariants?: boolean }[] {
  const finishById = new Map(FINISHES.map((finish) => [finish.id, finish] as const));
  const best = (sku: SKU, pts: (f: { luxuryPoints: number; wearResistance: number }) => number): number =>
    Math.max(0, ...sku.finish_options.map((id) => { const f = finishById.get(id); return f ? pts(f) : 0; }));
  const water = (sku: SKU): number =>
    sku.fixture_class === "toilet" ? sku.water?.flushLiters ?? 0 : sku.water?.flowRateLpm ?? 0;
  const { bTarget, bMax } = input.budget;
  return [
    { key: (sku) => -sku.price, cap: bTarget }, // closest to the target budget
    { key: (sku) => -sku.price, cap: bMax }, // premium within the hard ceiling
    // T-042: the same per-fixture points u_luxury scores (finish + premium tags, max 4).
    { key: (sku) => -luxuryPoints(sku), cap: bMax, sizeVariants: true },
    { key: (sku) => water(sku), cap: bMax },
    { key: (sku) => sku.dim.w * sku.dim.d, cap: bMax }, // smallest products (airy)
    { key: (sku) => -sku.dim.w * sku.dim.d, cap: bTarget }, // roomiest products (compact)
    { key: (sku) => -best(sku, (f) => f.wearResistance), cap: bMax },
  ];
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
      // T-032/T-036: at least one sink (standalone basin or vanity with its integrated
      // basin), exactly one deck faucet per sink, and at least one shower or tub.
      // The wet rule applies only when the template allows a shower or tub at all (the
      // drop-shower fallback template allows neither).
      const sinks = acc.filter((c) => c === "basin" || c === "vanity").length;
      const wet = acc.filter((c) => c === "shower" || c === "tub").length;
      const wetAllowed = active.some((a) => a.cls === "shower" || a.cls === "tub");
      if (sinks >= 1 && (wet >= 1 || !wetAllowed) && acc.filter((c) => c === "faucet").length === sinks) vectors.push([...acc]);
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
  const seen = new Set<string>();
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

    // Feature-constraint coverage: required tags carried by the bound set, and at
    // least one bound SKU offering a finish from the chosen families (plan-level
    // coverage; see bindingPool — NOT a per-SKU finish filter).
    const offersFamily = (s: SKU): boolean => s.finish_options.some((finishId) => families.has(familyByFinishId.get(finishId) ?? finishId));
    const accept = (set: SKU[]): void => {
      const tags = new Set(set.flatMap((s) => s.feature_tags));
      if (!required.every((tag) => tags.has(tag))) return;
      if (families.size > 0 && !set.some(offersFamily)) return;
      const sorted = [...set].sort((a, b) => (a.model_id < b.model_id ? -1 : 1));
      const key = sorted.map((s) => s.model_id).join("|");
      if (seen.has(key)) return;
      seen.add(key);
      out.push(sorted);
    };

    // T-032 themed seeds first: per axis, greedily take each class's best SKUs that stay
    // pair-compatible and leave room for the cheapest remainder under the axis cap.
    // A family-restricted retry keeps the seeds alive under a taste finish family.
    const greedy = (key: (sku: SKU) => number, cap: number, familyOnly: boolean): SKU[] | null => {
      const set: SKU[] = [];
      let cost = 0;
      for (let i = 0; i < active.length; i++) {
        const n = counts.get(active[i]) as number;
        let pool = pools.get(active[i]) as SKU[];
        if (familyOnly && pool.some(offersFamily)) pool = pool.filter(offersFamily);
        const ordered = [...pool].sort((a, b) => key(a) - key(b) || a.price - b.price || (a.model_id < b.model_id ? -1 : 1));
        let picked = 0;
        for (const sku of ordered) {
          if (picked === n) break; // bounded O(axes × pool): not charged to the node budget
          if (cost + sku.price + suffixMin[i + 1] > cap) continue;
          if (!set.every((c) => pairCompatible(graph, sku, c))) continue;
          set.push(sku);
          cost += sku.price;
          picked++;
        }
        if (picked < n) return null;
      }
      return set;
    };
    // T-042: one-swap neighbours of a seed — each product replaced by the smallest and the
    // roomiest same-class alternative with equal luxury points that stays compatible and
    // under the cap — so the spaciousness knob can still move a luxury plan.
    const sizeVariants = (set: SKU[], cap: number): void => {
      const total = set.reduce((t, x) => t + x.price, 0);
      for (const current of set) {
        const others = set.filter((x) => x !== current);
        const options = (pools.get(current.fixture_class) as SKU[]).filter((x) =>
          !set.includes(x) && luxuryPoints(x) === luxuryPoints(current) &&
          total - current.price + x.price <= cap && others.every((o) => pairCompatible(graph, x, o)));
        const area = (x: SKU): number => x.dim.w * x.dim.d;
        for (const pickOne of [(a: SKU, b: SKU) => area(a) - area(b), (a: SKU, b: SKU) => area(b) - area(a)]) {
          const swap = [...options].sort((a, b) => pickOne(a, b) || a.price - b.price)[0];
          if (swap !== undefined) accept([...others, swap]);
        }
      }
    };
    for (const axis of themeAxes(input)) {
      if (budget.nodes <= 0 || out.length >= maxSets) break;
      const set = greedy(axis.key, axis.cap, false);
      if (set !== null) {
        accept(set);
        if (axis.sizeVariants) sizeVariants(set, axis.cap);
      }
      if (families.size > 0) {
        const familySet = greedy(axis.key, axis.cap, true);
        if (familySet !== null) accept(familySet);
      }
    }

    const chosen: SKU[] = [];
    const enumClass = (i: number, cost: number) => {
      if (budget.nodes <= 0 || out.length >= maxSets) return;
      if (i === active.length) {
        accept(chosen);
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
