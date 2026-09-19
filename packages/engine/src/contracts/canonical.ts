// Determinism contract (OPT §14, ADR-017): canonical ordering, numeric precision, and
// hash inputs. Every solver/render output must be a pure function of HashInputs.

import type { RoomPolygon, Opening } from "./geometry.js";
import type { FeatureConstraints, Budget } from "./input.js";
import type { Priority, Spaciousness } from "./vocab.js";
import type { Config } from "../config/config-types.js";

/** All stored/serialized mm values round to this many decimal places (SCHEMA §2.1). */
export const MM_PRECISION_DP = 1;

/** Comparison epsilon: half of the 1-dp quantum. Config exposes this as epsilonMm. */
export const EPSILON_MM = 0.05;

/** Canonical tie-break order for equal scores (OPT §13.3). */
export const CANONICAL_TIEBREAK_ORDER = [
  "space-efficiency",
  "cheaper",
  "fewer-fixtures",
  "lexicographic-id",
] as const;

/** Canonical entity ordering: any unordered entity collection is sorted by its `id`
 *  field (ascending, code-unit order) before set computations. RoomPolygon vertices are
 *  normalized CCW starting from the lexicographically smallest (x, then y) vertex. */
export const CANONICAL_ENTITY_ORDER = "sort-by-id-ascending" as const;

/** Exactly what feeds hash(inputs) → hash(plan) (OPT §14). `catalogState` is typed
 *  unknown here: CatalogState is owned by the catalog module (T-003), and contracts must
 *  not depend on it. T-003 narrows this at the call site. */
export interface HashInputs {
  polygon: RoomPolygon;
  openings: Opening[];
  featureConstraints: FeatureConstraints;
  priority?: Priority;
  spaciousness?: Spaciousness;
  budget: Budget;
  config: Config;
  catalogState: unknown;
}

/** Deterministic serialization for hashing and snapshot identity.
 *  - object keys sorted ascending; `undefined` properties omitted (JSON semantics)
 *  - arrays serialized in given order (callers canonicalize order first)
 *  - numbers formatted to MM_PRECISION_DP (also canonicalizes -0 and float noise)
 *  - non-finite numbers and unsupported types throw (determinism over silence) */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return formatNumber(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(serialize).join(",")}]`;
  if (typeof v === "object") {
    const rec = v as Record<string, unknown>;
    const keys = Object.keys(rec)
      .filter((k) => rec[k] !== undefined)
      .sort();
    const body = keys.map((k) => `${JSON.stringify(k)}:${serialize(rec[k])}`).join(",");
    return `{${body}}`;
  }
  throw new Error(`canonicalJson: unsupported type ${typeof v}`);
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error("canonicalJson: non-finite number");
  return n.toFixed(MM_PRECISION_DP);
}
