// Finish resolution (T-009, discovered gap): Candidate bindings carry no finish, but
// the BOM is finish-aware (SCHEMA §4, OPT §3.2) and C8/u_cost must see the TRUE cost:
// resolved price = priceByFinish[finish] ?? price (SCHEMA §5). Resolved cost replaces
// the solver's plain s.price sum BEFORE scoring — a candidate whose resolved cost
// exceeds B_max is dropped here (OPT §5 C8 hard per complete candidate).
//
// Deterministic policy (engine choice; ADR candidate — reported, not self-recorded):
// 1. Eligibility: per SKU, finish options whose SCHEMA §4 family is in
//    featureConstraints.finishFamilies; empty list → every finish option eligible
//    (OPT §2.3: finish family is a taste filter, not a hard rule). A SKU with NO
//    eligible option falls back to its full finish list at its cheapest option —
//    the family constraint is plan-level (binding guarantees ≥1 chosen-family SKU)
//    and must not veto otherwise-valid classes (e.g. stone-only vanities under a
//    brushed-nickel taste).
// 2. Harmony (C7 finish-harmony spirit): when families are constrained, the
//    lexicographically first family shared by every SKU's eligible set is applied to
//    all SKUs that support it; the rest keep their cheapest eligible finish. When no
//    family is shared (e.g. white-only toilets + metal faucets), selection stays
//    per-SKU — harmony never forces an absent option.
// 3. Within a pool, the cheapest eligible finish wins; ties break on the
//    lexicographically smallest finish id. No RNG, no wall-clock (OPT §14).
// Pure functions only.
import type { Candidate } from "../contracts/candidate.js";
import type { InputSet } from "../contracts/input.js";
import type { CatalogState, SKU, Finish } from "../catalog/schema.js";
import type { FinishFamily } from "../contracts/vocab.js";
import { FINISHES } from "../catalog/data/finishes.js";

const FINISH_BY_ID: ReadonlyMap<string, Finish> = new Map(FINISHES.map((f) => [f.id, f] as const));

/** SCHEMA §4 finish record for a finish id, if known (unknown ids are catalog-gapped). */
export function finishOf(finishId: string): Finish | undefined {
  return FINISH_BY_ID.get(finishId);
}

/** Resolved finish + true price for one SKU. */
export interface FinishChoice {
  finish: string;
  price: number; // INR integer — priceByFinish[finish] ?? price
}

/** Finish resolution for a whole candidate, with the recomputed true cost. */
export interface ResolvedFinishes {
  /** Finish choice per unique bound SKU id. */
  choices: Map<string, FinishChoice>;
  /** Σ resolved prices over unique bound SKUs; ≤ B_max by construction. */
  cost: number;
}

interface PriceOption {
  id: string;
  price: number;
}

/** Eligible finish options for one SKU under the family constraint. */
function eligibleOptions(sku: SKU, families: readonly FinishFamily[]): PriceOption[] {
  const options: PriceOption[] = [];
  for (const finishId of sku.finish_options) {
    const finish = FINISH_BY_ID.get(finishId);
    // An unknown finish id cannot prove its family — only eligible unconstrained.
    if (families.length > 0 && (finish === undefined || !families.includes(finish.family))) {
      continue;
    }
    options.push({ id: finishId, price: sku.priceByFinish?.[finishId] ?? sku.price });
  }
  return options;
}

function byPriceThenId(a: PriceOption, b: PriceOption): number {
  return a.price - b.price || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Resolve finishes for a candidate. Returns null when the candidate is finish-
 *  inconsistent (a SKU has no eligible option) or its true cost exceeds B_max. */
export function resolveFinishes(
  candidate: Candidate,
  input: InputSet,
  catalog: CatalogState,
): ResolvedFinishes | null {
  const families = input.featureConstraints.finishFamilies;
  const byId = new Map(catalog.skus.map((s) => [s.model_id, s] as const));
  const uniqueIds = [...new Set(candidate.bindings.map((b) => b.fixture.skuId))].sort();

  const eligible = new Map<string, PriceOption[]>();
  for (const id of uniqueIds) {
    const sku = byId.get(id);
    if (sku === undefined) return null; // dangling binding — never emit
    const options = eligibleOptions(sku, families);
    // No family-eligible option → taste-filter fallback to the SKU's own finishes
    // (plan-level family coverage is enforced at binding, not per-SKU here).
    eligible.set(id, options.length > 0 ? options : eligibleOptions(sku, []));
  }

  // Harmony: only under an active family constraint (empty → per-SKU cheapest, §2.3).
  let shared: FinishFamily | null = null;
  if (families.length > 0) {
    const familySets = uniqueIds.map((id) => {
      const set = new Set<FinishFamily>();
      for (const option of eligible.get(id) ?? []) {
        const family = FINISH_BY_ID.get(option.id)?.family;
        if (family !== undefined) set.add(family);
      }
      return set;
    });
    const first = familySets[0];
    if (first) {
      shared = [...first].filter((family) => familySets.every((set) => set.has(family))).sort()[0] ?? null;
    }
  }

  const choices = new Map<string, FinishChoice>();
  let cost = 0;
  for (const id of uniqueIds) {
    const options = eligible.get(id) ?? [];
    const pool = shared !== null ? options.filter((o) => FINISH_BY_ID.get(o.id)?.family === shared) : options;
    const pick = (pool.length > 0 ? pool : options).slice().sort(byPriceThenId)[0];
    if (pick === undefined) return null; // unreachable by construction — defensive
    choices.set(id, { finish: pick.id, price: pick.price });
    cost += pick.price;
  }

  if (cost > input.budget.bMax) return null; // true-cost C8 gate (OPT §5)
  return { choices, cost };
}
