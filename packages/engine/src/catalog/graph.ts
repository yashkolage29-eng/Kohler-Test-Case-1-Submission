// Compatibility graph + substitutes construction (SCHEMA §7.6, §8) over surviving SKUs.
// Precedence: veto > force > default (§7.1). Deterministic: symmetric closure, sorted keys
// and values.

import type { Finish, FinishFamily, SKU } from "./schema.js";
import { faucetFitsBasin } from "./traits.js";

const WHITE_WARE: ReadonlySet<string> = new Set(["toilet", "basin", "tub", "vanity"]);

/** SCHEMA §7.2 rule-derived default. `familiesOf(finishes)` maps a finish id to its family. */
export function defaultOk(
  a: SKU,
  b: SKU,
  familiesOf: ReadonlyMap<string, FinishFamily>,
): boolean {
  if (a.fixture_class === "basin" && b.fixture_class === "faucet") return faucetFitsBasin(a, b);
  if (a.fixture_class === "faucet" && b.fixture_class === "basin") return faucetFitsBasin(b, a);
  if (WHITE_WARE.has(a.fixture_class) || WHITE_WARE.has(b.fixture_class)) return true;
  const fa = new Set(a.finish_options.map((f) => familiesOf.get(f)));
  for (const f of b.finish_options) {
    if (fa.has(familiesOf.get(f))) return true;
  }
  return false;
}

/** Symmetric closure of (force ∪ default-ok) pairs minus vetoes; every surviving SKU is a
 *  key (possibly with an empty list); keys and values sorted ascending (§7.6). */
export function compatibilityGraph(
  skus: readonly SKU[],
  forcedPairs: ReadonlySet<string>,
  vetoPairs: ReadonlySet<string>,
  familiesOf?: ReadonlyMap<string, FinishFamily>,
): Map<string, string[]> {
  const byId = new Map(skus.map((s) => [s.model_id, s] as const));
  const ids = skus.map((s) => s.model_id).sort();
  const graph = new Map<string, string[]>();
  for (const id of ids) graph.set(id, []);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      if (vetoPairs.has(`${a}\u0000${b}`)) continue; // pairKey normalizes order (a < b here)
      const forced = forcedPairs.has(`${a}\u0000${b}`);
      const byDefault = familiesOf !== undefined && defaultOk(byId.get(a) as SKU, byId.get(b) as SKU, familiesOf);
      if (!forced && !byDefault) continue;
      graph.get(a)?.push(b);
      graph.get(b)?.push(a);
    }
  }
  for (const list of graph.values()) list.sort();
  return graph;
}

/** Symmetric closure of the authored substitution sets over survivors; same class (already
 *  enforced at validation); keys and values sorted (§8). */
export function substituteMap(
  skus: readonly SKU[],
  authored: readonly (readonly [string, string])[],
): Map<string, string[]> {
  const ids = skus.map((s) => s.model_id).sort();
  const subs = new Map<string, string[]>();
  for (const id of ids) subs.set(id, []);
  for (const [a, b] of authored) {
    if (a === b) continue;
    if (!subs.has(a) || !subs.has(b)) continue;
    if (!subs.get(a)?.includes(b)) subs.get(a)?.push(b);
    if (!subs.get(b)?.includes(a)) subs.get(b)?.push(a);
  }
  for (const list of subs.values()) list.sort();
  return subs;
}

/** Finish id → family lookup table for the default rule. */
export function familiesOf(finishes: readonly Finish[]): Map<string, FinishFamily> {
  return new Map(finishes.map((f) => [f.id, f.family] as const));
}
