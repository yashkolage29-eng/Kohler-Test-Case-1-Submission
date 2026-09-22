// Hand-ordered relaxation paths (OPT §10.2.2, T-010): each path clones the InputSet
// with ONE named constraint deterministically relaxed, plus a measured trade-off
// label. Order = least disruptive to stated taste/budget: swap-sku (taste finish
// pool) → shrink-clearance (config-scoped, never below minLegal) → drop-class
// (taste class set) → raise-budget (money) → move-door (room edit). Every path is
// only generated when its lever can actually move (measured precondition); each is
// individually re-searched and fully re-validated by the caller (relax/relax.ts).
// Pure functions only; the original input is never mutated.
import type { InputSet, ClassCountRange } from "../contracts/input.js";
import type { CatalogState } from "../catalog/schema.js";
import type { RelaxationKind } from "../contracts/plan.js";
import type { FixtureClass } from "../contracts/vocab.js";
import { FIXTURE_CLASSES } from "../contracts/vocab.js";
import { cheapestSku } from "../solver/archetypes.js";
import { normalizeRoomPolygon } from "../geometry/polygon.js";
import { buildWallStrips } from "../geometry/strips.js";
import type { Opening } from "../contracts/geometry.js";
import type { FailDiagnosis } from "./diagnose.js";

export interface RelaxationPath {
  kind: RelaxationKind;
  /** Engine-generated measured trade-off summary (OPT §12.1) — narration may
   *  rephrase but never add to it. */
  tradeoffDelta: string;
  /** The relaxed clone to re-search independently. */
  input: InputSet;
}

/** The hand-ordered relaxation paths available for this failure. */
export function relaxationPaths(
  input: InputSet,
  catalog: CatalogState,
  diagnosis: FailDiagnosis,
): RelaxationPath[] {
  const paths: RelaxationPath[] = [];

  // 1. swap-sku (OPT §10.2.2a): widen the eligible SKU pool toward smaller/cheaper
  //    SKUs. The compat-graph and substitute sets are already inside every binding
  //    pool (same-class survivors), so the one deterministic pool-widening lever is
  //    the taste finish-family filter — releasing it admits every family's SKUs.
  const families = input.featureConstraints.finishFamilies;
  if (families.length > 0) {
    paths.push({
      kind: "swap-sku",
      tradeoffDelta: `swap-sku: finish-family taste constraint released (${families.join(", ")}) — the binding pool widens to every finish family`,
      input: {
        ...input,
        featureConstraints: { ...input.featureConstraints, finishFamilies: [] },
      },
    });
  }

  // 1b. drop-feature: release the taste required-feature set when the catalog
  //    cannot cover it within budget (e.g. the only smart toilet is premium-priced).
  //    One deterministic path releasing ALL required tags; finishes/classes stay.
  const requiredFeatures = input.featureConstraints.requiredFeatures;
  if (requiredFeatures.length > 0) {
    paths.push({
      kind: "drop-feature",
      tradeoffDelta: `drop-feature: required features released (${requiredFeatures.slice().sort().join(", ")}) — the plan no longer must include them`,
      input: {
        ...input,
        featureConstraints: { ...input.featureConstraints, requiredFeatures: [] },
      },
    });
  }

  // 2. shrink-clearance (OPT §10.2.2b): working clearances to the legal floor —
  //    config-scoped clone, never below minLegal (measured per-key deltas).
  const c2 = input.config.rules.C2;
  if (c2.minLegal !== undefined) {
    const parts: string[] = [];
    const values: Record<string, number> = { ...c2.values };
    let moved = false;
    for (const [key, value] of Object.entries(c2.values)) {
      const floor = c2.minLegal[key];
      if (typeof floor === "number" && floor < value) {
        values[key] = floor;
        parts.push(`${key} ${value}→${floor} mm`);
        moved = true;
      }
    }
    if (moved) {
      paths.push({
        kind: "shrink-clearance",
        tradeoffDelta: `shrink-clearance: working clearances reduced to the legal floor — ${parts.join(", ")}`,
        input: {
          ...input,
          config: {
            ...input.config,
            rules: { ...input.config.rules, C2: { ...c2, values } },
          },
        },
      });
    }
  }

  return withTailPaths(input, catalog, diagnosis, paths);
}

/** Paths 3–5 (drop-class, raise-budget, move-door). */
function withTailPaths(
  input: InputSet,
  catalog: CatalogState,
  diagnosis: FailDiagnosis,
  paths: RelaxationPath[],
): RelaxationPath[] {
  // 3. drop-class (OPT §10.2.2c): archetype tier down — the most expensive
  //    taste-required class (cheapest-SKU price desc, closed-vocab tie-break) is
  //    forced out of the taste class set ({min:0,max:0} zeroes the intersection).
  const tasteRequired: { cls: FixtureClass; range: ClassCountRange }[] = [];
  for (const cls of FIXTURE_CLASSES) {
    const range = input.featureConstraints.classCountRanges[cls];
    if (range !== undefined && range.min >= 1) tasteRequired.push({ cls, range });
  }
  if (tasteRequired.length > 0) {
    const priceOf = (cls: FixtureClass): number =>
      cheapestSku(catalog, cls)?.price ?? Number.POSITIVE_INFINITY;
    tasteRequired.sort(
      (a, b) =>
        priceOf(b.cls) - priceOf(a.cls) ||
        FIXTURE_CLASSES.indexOf(a.cls) - FIXTURE_CLASSES.indexOf(b.cls),
    );
    const drop = tasteRequired[0];
    // T-040: a sink is mandatory, so dropping a pinned vanity or basin frees the other one.
    const otherSink = drop.cls === "vanity" ? "basin" : drop.cls === "basin" ? "vanity" : undefined;
    const ranges = { ...input.featureConstraints.classCountRanges, [drop.cls]: { min: 0, max: 0 } };
    if (otherSink !== undefined) delete ranges[otherSink];
    paths.push({
      kind: "drop-class",
      tradeoffDelta: otherSink !== undefined
        ? `drop-class: ${drop.cls} replaced by a ${otherSink === "basin" ? "standalone basin" : "vanity"} (was min ${drop.range.min})`
        : `drop-class: ${drop.cls} removed from the taste class set (was min ${drop.range.min})`,
      input: {
        ...input,
        featureConstraints: { ...input.featureConstraints, classCountRanges: ranges },
      },
    });
  }

  // 3b. drop-shower (T-032/T-036): every default archetype requires a shower or tub; when
  //    none fits the room or budget, enable the reduced fallback templates, labeled.
  if (input.config.archetypes.some((a) => a.fallback === true)) {
    paths.push({
      kind: "drop-class",
      tradeoffDelta: "drop-class: shower/tub removed — no shower or tub layout fits this room and budget",
      input: {
        ...input,
        config: {
          ...input.config,
          archetypes: input.config.archetypes.map((a) => (a.fallback === true ? { ...a, fallback: false } : a)),
        },
      },
    });
  }

  // 4. raise-budget (OPT §10.2.2d): minimum recomputed = the measured cost deficit —
  //    B_max rises to exactly minViableCost (cheapest class-minimum set).
  const deficit = diagnosis.minGaps.budgetDeficitInr;
  if (deficit !== undefined && deficit > 0) {
    const target = input.budget.bMax + deficit;
    paths.push({
      kind: "raise-budget",
      tradeoffDelta: `raise-budget: B_max ${input.budget.bMax}→${target} INR (measured minimum raise ${deficit})`,
      input: { ...input, budget: { ...input.budget, bMax: target } },
    });
  }

  // 5. move-door (OPT §10.2.2e): each door is mirrored to the opposite end of its
  //    FULL wall edge (measured shift) — one deterministic variant that clears
  //    swing/clearance conflicts on the door side. Re-validation keeps it honest.
  const doorPath = moveDoorPath(input);
  if (doorPath !== null) paths.push(doorPath);

  return paths;
}

function moveDoorPath(input: InputSet): RelaxationPath | null {
  const doors = input.openings.filter((o) => o.kind === "door");
  if (doors.length === 0) return null;
  const normalized = normalizeRoomPolygon(input.polygon);
  if (!normalized.ok) return null;
  const fullLength = new Map(
    buildWallStrips(normalized.polygon).map((s) => [s.id, s.usableLengthMm] as const),
  );

  const moved: string[] = [];
  const openings: Opening[] = input.openings.map((opening) => {
    if (opening.kind !== "door") return opening;
    const length = fullLength.get(opening.wallId);
    if (length === undefined) return opening;
    const next = length - opening.spanMm - opening.alongOffsetMm;
    if (!Number.isFinite(next) || next < 0 || next === opening.alongOffsetMm) return opening;
    moved.push(`${opening.id} ${Math.abs(next - opening.alongOffsetMm)} mm`);
    return { ...opening, alongOffsetMm: next };
  });
  if (moved.length === 0) return null;
  return {
    kind: "move-door",
    tradeoffDelta: `move-door: ${moved.join(", ")} — each door mirrored to the opposite end of its wall`,
    input: { ...input, openings },
  };
}