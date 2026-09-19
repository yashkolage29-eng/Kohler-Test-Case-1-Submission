// T-014 render-geometry builder (ADR-010 `render = catalog geometry`): the SINGLE
// deterministic bridge from a solved Plan + InputSet to the RenderGeometry contract
// (contracts/render.ts). Every fixture AABB is recomputed with the SAME engine
// aabbForPlacement the solver/validation used; annotations are derived ONLY from the
// fired-rule trace + openings — the builder never invents geometry or values.
// Pure functions only: no DOM, no I/O, no randomness.

import type { AABB, Opening, Vec2 } from "../contracts/geometry.js";
import type { InputSet } from "../contracts/input.js";
import type { FixtureClass } from "../contracts/vocab.js";
import type { Plan } from "../contracts/plan.js";
import type {
  PlacedFixtureRender,
  RenderAnnotation,
  RenderGeometry,
} from "../contracts/render.js";
import { aabbForPlacement } from "../geometry/aabb.js";
import { buildWallStrips, stripPoint } from "../geometry/strips.js";
import { normalizeRoomPolygon } from "../geometry/polygon.js";
import { roundMm } from "../geometry/num.js";
import { EPSILON_MM } from "../contracts/canonical.js";
import { clearanceSpecFor } from "../geometry/rules/c2_clearance.js";

/** Deterministic 1-dp millimetre text (SCHEMA §2.1): `${roundMm(n)} mm`. */
function fmtMm(n: number): string {
  return `${roundMm(n)} mm`;
}

/** AABB center in room coordinates (used to anchor annotations to engine facts). */
function aabbCenter(aabb: AABB): Vec2 {
  return {
    x: roundMm((aabb.min.x + aabb.max.x) / 2),
    y: roundMm((aabb.min.y + aabb.max.y) / 2),
  };
}

/** Build the wall strips exactly the way the solver/validation pipeline does. */
function stripsFor(polygon: InputSet["polygon"]): ReturnType<typeof buildWallStrips> {
  const normalized = normalizeRoomPolygon(polygon);
  return buildWallStrips(normalized.ok ? normalized.polygon : polygon);
}

/** Room-dimension annotations: one for the bbox width, one for the bbox height,
 *  placed just outside the polygon bbox (offset 150 mm, deterministic). */
function dimensionAnnotations(vertices: Vec2[]): RenderAnnotation[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of vertices) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return [
    {
      kind: "dimension",
      at: { x: roundMm((minX + maxX) / 2), y: roundMm(maxY + 150) },
      text: fmtMm(maxX - minX),
    },
    {
      kind: "dimension",
      at: { x: roundMm(maxX + 150), y: roundMm((minY + maxY) / 2) },
      text: fmtMm(maxY - minY),
    },
  ];
}

/** Clearance annotations from C2 verdicts ONLY (grounded in measuredDeltas /
 *  valuesUsed — never invented):
 *  - Failing verdict: one annotation per `shortfallMm:<sku>:<aspect>` delta, anchored
 *    at the center of the fixture whose skuId matches (room center as fallback),
 *    text = `${shortfall} mm`.
 *  - Boundary verdict (pass, but some measured minimum equals the required value):
 *    one annotation per `minMm:<class>:<aspect>` delta with min ≤ required, anchored
 *    at the center of the first fixture of that class, text = `${min} mm`. */
function clearanceAnnotations(plan: Plan, fixtureAabbs: PlacedFixtureRender[]): RenderAnnotation[] {
  const out: RenderAnnotation[] = [];
  const fallback: Vec2 = { x: 0, y: 0 };
  const centerForSku = (skuId: string): Vec2 => {
    const fixture = fixtureAabbs.find((f) => f.modelId === skuId);
    return fixture ? aabbCenter(fixture.aabb) : fallback;
  };
  const centerForClass = (cls: string): Vec2 => {
    const fixture = fixtureAabbs.find((f) => f.fixtureClass === (cls as FixtureClass));
    return fixture ? aabbCenter(fixture.aabb) : fallback;
  };
  for (const verdict of plan.firedTrace) {
    if (verdict.ruleId !== "C2") continue;
    if (!verdict.pass) {
      for (const [key, value] of Object.entries(verdict.measuredDeltas)) {
        if (!key.startsWith("shortfallMm:")) continue;
        const sku = key.split(":")[1] ?? "";
        out.push({ kind: "clearance", at: centerForSku(sku), text: fmtMm(value) });
      }
      continue;
    }
    // Boundary: measured minimum exactly at (or under, within epsilon) the requirement.
    for (const [key, min] of Object.entries(verdict.measuredDeltas)) {
      if (!key.startsWith("minMm:")) continue;
      const [, cls, aspect] = key.split(":");
      const spec = clearanceSpecFor(cls as FixtureClass).find((s) => s.aspect === aspect);
      const required = spec ? verdict.valuesUsed[spec.key] : undefined;
      if (typeof required !== "number" || min > required + EPSILON_MM) continue;
      out.push({ kind: "clearance", at: centerForClass(cls ?? ""), text: fmtMm(min) });
    }
  }
  return out;
}

/** Swing annotations: one per opening carrying an engine-defined swing, anchored at
 *  the opening span midpoint on its wall strip, text from the opening itself. */
function swingAnnotations(
  openings: Opening[],
  strips: ReturnType<typeof buildWallStrips>,
): RenderAnnotation[] {
  const out: RenderAnnotation[] = [];
  for (const opening of openings) {
    if (!opening.swing) continue;
    const strip = strips.find((s) => s.id === opening.wallId);
    if (!strip) continue;
    out.push({
      kind: "swing",
      at: stripPoint(strip, opening.alongOffsetMm + opening.spanMm / 2),
      text: `${opening.kind} ${fmtMm(opening.spanMm)}`,
    });
  }
  return out;
}

/** Deterministically project a Plan + InputSet onto the RenderGeometry contract.
 *  Throws on contract violations (unknown strip id, failed AABB computation) — the
 *  plan is geometryValid by construction, so failure here is a bug, not a soft case. */
export function buildRenderGeometry(plan: Plan, input: InputSet): RenderGeometry {
  const strips = stripsFor(input.polygon);

  const fixtures: PlacedFixtureRender[] = plan.selectedCandidate.bindings.map((binding) => {
    const strip = strips.find((s) => s.id === binding.wallStripId);
    if (!strip) {
      throw new Error(`buildRenderGeometry: unknown wallStripId ${binding.wallStripId}`);
    }
    const result = aabbForPlacement(
      strip,
      binding.posAlongMm,
      { w: binding.fixture.footprintMm.w, d: binding.fixture.footprintMm.d },
      binding.orientation,
    );
    if (!result.ok) {
      throw new Error(
        `buildRenderGeometry: aabb failed for ${binding.fixture.skuId}: ${result.reasons.join(";")}`,
      );
    }
    // Deterministic first-match finish lookup from the plan BOM (omit when absent).
    const finish = plan.bom.lineItems.find((li) => li.model_id === binding.fixture.skuId)?.finish;
    return {
      modelId: binding.fixture.skuId,
      fixtureClass: binding.fixture.class,
      wallStripId: binding.wallStripId,
      aabb: result.aabb,
      orientationDeg: binding.orientation,
      ...(finish === undefined ? {} : { finish }),
    };
  });

  const annotations: RenderAnnotation[] = [
    ...dimensionAnnotations(input.polygon.vertices),
    ...clearanceAnnotations(plan, fixtures),
    ...swingAnnotations(input.openings, strips),
  ];

  return {
    polygon: input.polygon,
    openings: input.openings,
    fixtures,
    annotations,
  };
}
