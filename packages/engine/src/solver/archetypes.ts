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
    // Budget filter: cheapest possible binding must not exceed the hard ceiling.
    if (minCost > bMax) continue;
    // Room filter: minimum fixture widths must fit the usable wall strips.
    if (minWidthMm > roomUsableLengthMm) continue;
    out.push(arch);
  }
  return out;
}
