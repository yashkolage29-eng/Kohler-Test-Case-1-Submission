// Wall-strip placement CSP (OPT §9): backtracking over (wall assignment → 1D
// order → discrete slot position). Forward-checking approximations fail fast:
// footprint inside polygon + no overlap with placed AABBs (C1 approx) and front
// clearance measured against walls + placed blockers (C2 approximation — final
// authority is the full evaluateGeometryRules pass in the assembler). Ordering
// per §9: plumbing-anchor-first WC → shower → basin → tub → vanity → extras,
// then largest footprint first; walls pre-sorted (usable length desc, then id —
// affinity ordering degenerates to this because zone derivation is T-006/T-007
// scope and rep.plumbingZones is empty; recorded as a spec note). Slots sit on
// the config slotGridMm grid. `budget.nodes` bounds the search; exhaustion is
// reported, never hung. Pure functions only.
import type { AABB, BathroomRep, WallStrip, ZoneKind } from "../contracts/geometry.js";
import type { Fixture, FixtureBinding } from "../contracts/candidate.js";
import type { InputSet } from "../contracts/input.js";
import type { FixtureClass } from "../contracts/vocab.js";
import type { SKU } from "../catalog/schema.js";
import { resolvePlacement, blockersAhead, clearDistanceMm } from "../geometry/rules/common.js";
import { clearanceCorridors, clearanceSpecFor } from "../geometry/rules/c2_clearance.js";
import { roughInForwardOk } from "../geometry/rules/c5_plumbing.js";
import { aabbInsidePolygonMm, aabbIntersectsMm } from "../geometry/aabb.js";
import { roundMm } from "../geometry/num.js";

/** §9 plumbing-anchor class order; extras (vanity/faucet/accessory) trail. */
const ANCHOR_ORDER: FixtureClass[] = [
  "toilet",
  "shower",
  "basin",
  "tub",
  "vanity",
  "faucet",
  "accessory",
];

/** Class affinity (zone KINDS, contracts/candidate.ts). */
const CLASS_AFFINITY: Partial<Record<FixtureClass, ZoneKind[]>> = {
  toilet: ["toilet"],
  basin: ["vanity"],
  vanity: ["vanity"],
  shower: ["shower"],
  tub: ["tub"],
};

export function makeFixture(sku: SKU): Fixture {
  const affinity = CLASS_AFFINITY[sku.fixture_class] ?? [];
  // `zones` stays empty: the room rep declares no plumbing zones in the MVP
  // (zone derivation is T-006/T-007 scope), so the solver asserts no zone
  // requirement — C4 then measures nothing rather than failing on a dangling
  // requirement. classAffinity retains the class-level wall preference.
  return {
    skuId: sku.model_id,
    class: sku.fixture_class,
    footprintMm: { w: sku.dim.w, d: sku.dim.d, h: sku.dim.h },
    classAffinity: affinity,
    orientation: 0,
    featureTags: sku.feature_tags,
    zones: [],
  };
}

/** §9 deterministic fixture order: anchor class → largest footprint → skuId. */
export function orderFixtures(skus: SKU[]): Fixture[] {
  return skus
    .map(makeFixture)
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      const ca = ANCHOR_ORDER.indexOf(a.f.class);
      const cb = ANCHOR_ORDER.indexOf(b.f.class);
      if (ca !== cb) return ca - cb;
      const fa = a.f.footprintMm.w * a.f.footprintMm.d;
      const fb = b.f.footprintMm.w * b.f.footprintMm.d;
      if (fa !== fb) return fb - fa;
      if (a.f.skuId !== b.f.skuId) return a.f.skuId < b.f.skuId ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.f);
}

/** Walls pre-sorted by affinity (§9): usable length desc, then id — zone
 *  derivation is empty in the MVP, so longer walls host anchor fixtures first. */
export function orderWalls(strips: WallStrip[]): WallStrip[] {
  return [...strips].sort(
    (a, b) =>
      b.usableLengthMm - a.usableLengthMm ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export interface PlacementSearch {
  bindings: FixtureBinding[][];
  /** True when the shared node budget ran out before exhaustion. */
  exhausted: boolean;
  /** Measured fail-fast blockers (dedup later, sorted). */
  blockers: string[];
}

/** Forward-check approximation of C2: front AND side clearances (fail fast; the
 *  full C2 evaluator is the authority at assembly). Classes without a spec
 *  (faucet/accessory) impose no approximation. */
function clearanceApprox(
  binding: FixtureBinding,
  fixture: Fixture,
  placed: AABB[],
  rep: BathroomRep,
  input: InputSet,
): boolean {
  const resolved = resolvePlacement(binding, rep);
  if (!resolved.ok) return true; // full validation reports this precisely
  for (const spec of clearanceSpecFor(fixture.class)) {
    // Front AND side aspects are both approximated here — skipping side let the
    // search return corner-crammed arrangements that full-rule C2 always rejected.
    const required = input.config.rules.C2.values[spec.key];
    if (typeof required !== "number") continue;
    for (const corridor of clearanceCorridors(resolved.placement, spec.aspect)) {
      const ahead = blockersAhead(placed, corridor.travel, corridor.dir, corridor.from);
      const available = clearDistanceMm({
        rep,
        blockers: ahead,
        from: corridor.from,
        reach: required,
        travel: corridor.travel,
        dir: corridor.dir,
        lateral: corridor.lateral,
      });
      if (available < required - 0.05) return false;
    }
  }
  return true;
}

/** §9 planning-level cap on complete placements enumerated per SKU set. The raw
 *  slot DFS has millions of valid arrangements even in a small room; unbounded
 *  enumeration consumed the entire backtracking budget before any candidate was
 *  assembled (observed: 1.5M complete placements for one 4-fixture set). The first
 *  N results in deterministic (wall, slot) order give the assembler enough
 *  arrangement diversity to find rule-valid layouts while bounding total work. */
export const MAX_PLACEMENTS_PER_SET = 512;

/**
 * Solve wall assignments + discrete slot positions for a fixed SKU set.
 * At most MAX_PLACEMENTS_PER_SET complete placements are returned, in deterministic
 * (wall, slot) discovery order; the caller assembles and fully validates each.
 * Orientation is 0 for the MVP (footprint back flush on the wall, width along the
 * wall — matches aabbForPlacement's flush-wall model).
 */
export function solvePlacements(
  skus: SKU[],
  rep: BathroomRep,
  input: InputSet,
  budget: { nodes: number },
  maxResults: number = MAX_PLACEMENTS_PER_SET,
): PlacementSearch {
  const fixtures = orderFixtures(skus);
  const walls = orderWalls(rep.strips);
  const grid = rep.slotGridMm;
  const results: FixtureBinding[][] = [];
  const blockers: string[] = [];
  const slotOrders = new Map<string, number[]>();
  let exhausted = false;

  const dfs = (i: number, acc: FixtureBinding[], aabbs: AABB[]) => {
    if (exhausted || results.length >= maxResults) return;
    if (budget.nodes <= 0) {
      exhausted = true;
      return;
    }
    if (i === fixtures.length) {
      results.push([...acc]);
      return;
    }
    const fixture = fixtures[i];
    if (fixture.class === "faucet") {
      // Deck faucets mount on a sink (T-028), never on a wall slot of their own: the
      // k-th faucet is centred at the back of the k-th placed basin or vanity (T-032;
      // both precede faucets in ANCHOR_ORDER). C1 accepts it as deck-mounted when inside.
      const hosts = acc.filter((b) => b.fixture.class === "basin" || b.fixture.class === "vanity");
      const host = hosts[acc.filter((b) => b.fixture.class === "faucet").length];
      if (host === undefined) {
        blockers.push(`fc-no-faucet-host:${fixture.skuId}`);
        return;
      }
      const hostW = host.fixture.footprintMm.w;
      if (fixture.footprintMm.w > hostW || fixture.footprintMm.d > host.fixture.footprintMm.d) {
        blockers.push(`fc-faucet-exceeds-basin:${fixture.skuId}`);
        return;
      }
      budget.nodes -= 1;
      acc.push({
        fixture,
        wallStripId: host.wallStripId,
        posAlongMm: roundMm(host.posAlongMm + (hostW - fixture.footprintMm.w) / 2),
        orientation: 0,
      });
      dfs(i + 1, acc, aabbs);
      acc.pop();
      return;
    }
    const alongWall = fixture.footprintMm.w; // orientation 0
    for (const strip of walls) {
      if (results.length >= maxResults) return;
      const maxPos = strip.usableLengthMm - alongWall;
      if (maxPos < 0) continue;
      const maxSlot = Math.floor(maxPos / grid);
      // Center-out slot order: raw slot-ascending DFS discovers only corner-crammed
      // arrangements first (every one failing full-rule validation); mid-wall
      // placements are the buildable ones. Deterministic order, same slot set.
      const orderKey = `${strip.id}:${maxSlot}`;
      let slotOrder = slotOrders.get(orderKey);
      if (slotOrder === undefined) {
        slotOrder = Array.from({ length: maxSlot + 1 }, (_, s) => s).sort(
          (a, b) => Math.abs(a - maxSlot / 2) - Math.abs(b - maxSlot / 2) || a - b,
        );
        slotOrders.set(orderKey, slotOrder);
      }
      for (const slot of slotOrder) {
        if (results.length >= maxResults) return;
        if (budget.nodes <= 0) {
          exhausted = true;
          return;
        }
        budget.nodes -= 1;
        const binding: FixtureBinding = {
          fixture,
          wallStripId: strip.id,
          posAlongMm: slot * grid,
          orientation: 0,
        };
        const resolved = resolvePlacement(binding, rep);
        if (!resolved.ok) {
          blockers.push(`fc-invalid-placement:${fixture.skuId}`);
          continue;
        }
        const aabb = resolved.placement.aabb;
        // C1 approximation: inside the polygon, no overlap with placed fixtures.
        if (!aabbInsidePolygonMm(aabb, rep.polygon)) {
          blockers.push(`fc-outside-room:${fixture.skuId}`);
          continue;
        }
        if (aabbs.some((b) => aabbIntersectsMm(aabb, b))) {
          blockers.push(`fc-overlap:${fixture.skuId}`);
          continue;
        }
        // C2 approximation (front + side corridors, fail fast).
        if (!clearanceApprox(binding, fixture, aabbs, rep, input)) {
          blockers.push(`fc-front-clearance-short:${fixture.skuId}`);
          continue;
        }
        // C5 forward check (T-037): rough-in clear of openings and other rough-ins.
        const placed = acc.flatMap((b) => { const r = resolvePlacement(b, rep); return r.ok ? [r.placement] : []; });
        if (!roughInForwardOk(resolved.placement, placed, rep, input.config)) {
          blockers.push(`fc-rough-in-opening:${fixture.skuId}`);
          continue;
        }
        acc.push(binding);
        aabbs.push(aabb);
        // Re-approximate every placed fixture: a later fixture can break an earlier
        // one's side clearance (e.g. a basin set beside the toilet), and only the
        // arriving fixture was checked above.
        const allClear = acc.every((b) => clearanceApprox(b, b.fixture, aabbs, rep, input));
        if (allClear) dfs(i + 1, acc, aabbs);
        acc.pop();
        aabbs.pop();
      }
    }
  };
  dfs(0, [], []);
  return { bindings: results, exhausted, blockers };
}
