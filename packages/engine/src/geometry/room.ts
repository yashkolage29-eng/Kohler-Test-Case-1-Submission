// Room build gate — the deterministic Step-01 gate (OPT §13.1, SYS-ARCH §5.1).
// Confirmed inputs produce the canonical BathroomRep (normalized polygon, wall strips
// with keep-clear-subtracted usable lengths, canonically ordered openings). Unconfirmed
// or malformed input is rejected with stable reason strings — the solver never runs on
// it. plumbingZones and obstacles stay empty here: zone derivation is T-006/T-007
// scope. Pure functions only.

import type { BathroomRep } from "../contracts/geometry.js";
import type { InputSet } from "../contracts/input.js";
import { roundMm } from "./num.js";
import { normalizeRoomPolygon } from "./polygon.js";
import { buildWallStrips } from "./strips.js";
import { subtractKeepClear, validateOpenings } from "./openings.js";

export type RoomBuildResult =
  | { ok: true; rep: BathroomRep }
  | { ok: false; reasons: string[] };

export function buildBathroomRep(input: InputSet): RoomBuildResult {
  // Step-01 gate: confirmation is a hard block.
  if (!input.confirmed) {
    return { ok: false, reasons: ["input-not-confirmed"] };
  }

  const polygon = normalizeRoomPolygon(input.polygon);
  if (!polygon.ok) {
    return { ok: false, reasons: polygon.reasons };
  }

  if (!Number.isFinite(input.config.slotGridMm) || input.config.slotGridMm <= 0) {
    return { ok: false, reasons: ["invalid-slot-grid"] };
  }

  // Strips at full edge length (openings validate against full walls).
  const fullStrips = buildWallStrips(polygon.polygon);
  const openings = validateOpenings(input.openings, fullStrips);
  if (!openings.ok) {
    return { ok: false, reasons: openings.reasons };
  }

  const strips = subtractKeepClear(fullStrips, openings.openings);
  const rep: BathroomRep = {
    polygon: polygon.polygon,
    strips,
    openings: openings.openings,
    plumbingZones: [], // zone derivation is T-006/T-007 scope
    obstacles: [],
    slotGridMm: roundMm(input.config.slotGridMm),
  };
  return { ok: true, rep };
}
