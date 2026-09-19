// C4 — Zones (OPT §5): each fixture's zone footprint stays within its allotted
// zone span. Model: a fixture binding names the zone KINDS it accepts
// (Fixture.zones); the room declares Zones as spans on wall strips. A binding
// passes when some zone of an accepted kind on the SAME strip contains the
// placement span [start, end] (ends may touch within EPSILON_MM). A fixture
// with no accepted kinds (faucets/accessories) is skipped. A fixture with
// accepted kinds but no matching zone on its strip fails — zones are allocated
// by the caller (solver), so a dangling requirement is a validation fact, not
// silently ignored. Deltas: per-fixture out-of-span amount and maxOutSpanMm,
// measured even when passing. Deterministic order: sortBindings then zones by
// id. Pure functions.

import type { BathroomRep } from "../../contracts/geometry.js";
import type { FixtureBinding } from "../../contracts/candidate.js";
import type { Config } from "../../config/config-types.js";
import type { RuleId, RuleVerdict } from "../../contracts/receipt.js";
import { EPSILON_MM } from "../../contracts/canonical.js";
import { roundMm } from "../num.js";
import { resolvePlacements, sortById } from "./common.js";

export function evaluateC4(
  candidateBindings: FixtureBinding[],
  rep: BathroomRep,
  config: Config,
): RuleVerdict {
  const valuesUsed = { ...config.rules.C4.values };
  const deltas: Record<string, number> = { maxOutSpanMm: 0 };
  const reasons: string[] = [];
  const { placements, failures } = resolvePlacements(candidateBindings, rep);
  for (const failure of failures) {
    reasons.push(`c4-${failure}`);
  }

  const zones = sortById(rep.plumbingZones);
  for (const p of placements) {
    const accepted = p.binding.fixture.zones;
    if (accepted.length === 0) continue; // class carries no zone requirement
    const candidates = zones.filter(
      (z) => accepted.includes(z.kind) && z.wallStripId === p.strip.id,
    );
    if (candidates.length === 0) {
      reasons.push(`c4-no-zone:${p.binding.fixture.skuId}`);
      continue;
    }
    // Smallest out-of-span amount across candidate zones (deterministic: zones
    // already sorted by id; strict less-than keeps the first best).
    let bestOut = Infinity;
    let bestZone = candidates[0];
    for (const z of candidates) {
      const out = Math.max(z.spanStartMm - p.span.start, p.span.end - z.spanEndMm, 0);
      if (out < bestOut) {
        bestOut = out;
        bestZone = z;
      }
    }
    deltas[`outSpanMm:${p.binding.fixture.skuId}`] = roundMm(bestOut);
    deltas.maxOutSpanMm = Math.max(deltas.maxOutSpanMm, bestOut);
    if (bestOut > EPSILON_MM) {
      reasons.push(`c4-outside-zone:${p.binding.fixture.skuId}:${bestZone.id}`);
    }
  }
  deltas.maxOutSpanMm = roundMm(deltas.maxOutSpanMm);

  return {
    ruleId: "C4" satisfies RuleId,
    pass: reasons.length === 0,
    valuesUsed,
    measuredDeltas: deltas,
    explanation:
      reasons.length === 0 ? "c4-pass:all-fixtures-in-zone" : reasons.join(";"),
  };
}
