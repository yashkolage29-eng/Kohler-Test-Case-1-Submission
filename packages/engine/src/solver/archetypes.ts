// Archetype layer (OPT §8.1): filter the config archetype templates against the
// taste feature-constraint set, the room, and the budget. A class's effective
// count range is the intersection of the archetype range and the taste range;
// an archetype is infeasible when a taste-required class has no intersecting
// range, when its minimum fixture set cannot fit the room's usable wall length,
// or when its cheapest binding already exceeds B_max. Deterministic: templates
// kept in config order, ranges resolved over the closed FIXTURE_CLASSES order.
// Pure functions only.
import type { ClassCountRange, InputSet } from "../contracts/input.js";
import type { FixtureClass } from "../contracts/vocab.js";
import { FIXTURE_CLASSES } from "../contracts/vocab.js";
import type { CatalogState, SKU } from "../catalog/schema.js";
import type { ArchetypeTemplate } from "../config/config-types.js";

/** Intersection result: null means the ranges conflict (archetype infeasible). */
export function effectiveCountRange(
  arch: ArchetypeTemplate,
  input: InputSet,
  cls: FixtureClass,
): ClassCountRange | null {
  const a = arch.classCountRanges[cls];
  const t = input.featureConstraints.classCountRanges[cls];
  if (!a && !t) return { min: 0, max: 0 };
  if (!a) return t && t.min > 0 ? null : { min: 0, max: 0 };
  if (!t) return { min: a.min, max: a.max };
  const min = Math.max(a.min, t.min);
  const max = Math.min(a.max, t.max);
  return min > max ? null : { min, max };
}

/** T-032/T-036: every bathroom needs at least one sink (basin or vanity) and at least one
 *  wet fixture (shower or tub), even when each class is individually optional. */
export const ONE_OF_GROUPS: readonly (readonly FixtureClass[])[] = [["basin", "vanity"], ["shower", "tub"]];

/** How many fixtures of `group` the minimum counts leave uncovered (0 or 1). */
export function missingOneOf(ranges: Partial<Record<FixtureClass, ClassCountRange | undefined>>, group: readonly FixtureClass[]): number {
  return Math.max(0, 1 - group.reduce((t, cls) => t + (ranges[cls]?.min ?? 0), 0));
}

/** Cheapest surviving SKU of a class (price asc, then model_id), or null. */
export function cheapestSku(catalog: CatalogState, cls: FixtureClass): SKU | null {
  let best: SKU | null = null;
  for (const sku of catalog.skus) {
    if (sku.fixture_class !== cls) continue;
    if (
      best === null ||
      sku.price < best.price ||
      (sku.price === best.price && sku.model_id < best.model_id)
    ) {
      best = sku;
    }
  }
  return best;
}

/** Taste/room/budget-feasible archetypes, in deterministic (config) order. */
export function filterArchetypes(input: InputSet, catalog: CatalogState, roomUsableLengthMm: number): ArchetypeTemplate[] {
  const bMax = input.budget.bMax;
  const out: ArchetypeTemplate[] = [];
  for (const arch of input.config.archetypes) {
    if (arch.fallback === true) continue; // T-032: only the drop-shower relaxation enables it
    let feasible = true;
    let minCost = 0;
    let minWidthMm = 0;
    for (const cls of FIXTURE_CLASSES) {
      const range = effectiveCountRange(arch, input, cls);
      if (range === null) {
        feasible = false; // taste-required class conflicts with the archetype
        break;
      }
      if (range.min === 0) continue;
      const cheapest = cheapestSku(catalog, cls);
      if (cheapest === null) {
        feasible = false; // class required but catalog has no surviving SKU
        break;
      }
      minCost += cheapest.price * range.min;
      minWidthMm += cheapest.dim.w * range.min;
    }
    if (!feasible) continue;
    // T-032/T-036: the mandatory sink and wet fixture count toward minimum cost and width.
    for (const group of ONE_OF_GROUPS) {
      const ranges: Partial<Record<FixtureClass, ClassCountRange>> = {};
      for (const cls of group) ranges[cls] = effectiveCountRange(arch, input, cls) ?? undefined;
      if (missingOneOf(ranges, group) === 0) continue;
      const options = group
        .filter((cls) => (ranges[cls]?.max ?? 0) > 0)
        .map((cls) => cheapestSku(catalog, cls))
        .filter((sku): sku is SKU => sku !== null);
      if (options.length === 0) {
        // Not applicable when the template (or an explicit taste exclusion) allows no class
        // of the group — e.g. the drop-shower fallback; a sink is always allowed.
        if (group.every((cls) => (ranges[cls]?.max ?? 0) === 0)) continue;
        feasible = false; // allowed but not stocked
        break;
      }
      minCost += Math.min(...options.map((sku) => sku.price));
      minWidthMm += Math.min(...options.map((sku) => sku.dim.w));
    }
    if (!feasible) continue;
    // Budget filter: cheapest possible binding must not exceed the hard ceiling.
    if (minCost > bMax) continue;
    // Room filter: minimum fixture widths must fit the usable wall strips.
    if (minWidthMm > roomUsableLengthMm) continue;
    out.push(arch);
  }
  return out;
}
