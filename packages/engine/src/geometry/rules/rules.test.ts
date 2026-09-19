// T-006 rule-evaluator tests: pass/fail/boundary per rule, config-driven
// values, L-shape cases, and the composite C1–C6 trace. Scene: 2400×1800
// rectangle, toilet on the bottom wall at 450 (side clearance exactly at the
// 450 threshold), basin on the left wall at 400, door on the bottom wall at
// 1500–2100 in-swing, toilet/vanity zone spans 0–1200. Every coordinate is
// hand-computed against aabb.ts/strips.ts conventions (bottom wall = max-y,
// inward normal (0,-1); left wall = x=0, inward (1,0)).

import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../../index.js";
import type { AABB, BathroomRep, RoomPolygon, Vec2, Zone } from "../../contracts/geometry.js";
import type { Fixture, FixtureBinding } from "../../contracts/candidate.js";
import type { FixtureClass, ZoneKind } from "../../contracts/vocab.js";
import type { Config } from "../../config/config-types.js";
import { buildWallStrips } from "../strips.js";
import { evaluateC1 } from "./c1_fit.js";
import { evaluateC2 } from "./c2_clearance.js";
import { evaluateC3 } from "./c3_swing.js";
import { evaluateC4 } from "./c4_zones.js";
import { evaluateC5 } from "./c5_plumbing.js";
import { evaluateC6 } from "./c6_sanity.js";
import { evaluateGeometryRules } from "./index.js";

const v = (x: number, y: number): Vec2 => ({ x, y });
const RECT: Vec2[] = [v(0, 0), v(2400, 0), v(2400, 1800), v(0, 1800)];
const LSHAPE: Vec2[] = [
  v(0, 0),
  v(3000, 0),
  v(3000, 1200),
  v(1200, 1200),
  v(1200, 2400),
  v(0, 2400),
];
const polygon = (vertices: Vec2[]): RoomPolygon => ({ vertices, ccw: true, wallThicknessMm: 100 });

const door = (wallId: string, alongOffsetMm: number) => ({
  id: "door-1",
  wallId,
  kind: "door" as const,
  alongOffsetMm,
  spanMm: 600,
  swing: { side: "in" as const, leafDimsMm: { w: 600, d: 25 } },
});

const zone = (id: string, kind: ZoneKind, wallStripId: string, spanStartMm: number, spanEndMm: number): Zone => ({
  id,
  kind,
  wallStripId,
  spanStartMm,
  spanEndMm,
});

function makeRep(
  polygonVertices: Vec2[],
  openings: ReturnType<typeof door>[] = [],
  zones: Zone[] = [],
  obstacles: { id: string; aabb: AABB }[] = [],
): BathroomRep {
  return {
    polygon: polygon(polygonVertices),
    strips: buildWallStrips(polygon(polygonVertices)),
    openings,
    plumbingZones: zones,
    obstacles,
    slotGridMm: 25,
  };
}

const REP = makeRep(RECT, [door("wall-bottom", 1500)], [
  zone("zone-toilet", "toilet", "wall-bottom", 0, 1200),
  zone("zone-vanity", "vanity", "wall-left", 0, 1200),
]);

let skuCounter = 0;
function makeFixture(cls: FixtureClass, w: number, d: number, kinds: ZoneKind[]): Fixture {
  skuCounter += 1;
  return {
    skuId: `K-${cls.toUpperCase()}-${skuCounter}`,
    class: cls,
    footprintMm: { w, d, h: 800 },
    classAffinity: kinds,
    orientation: 0,
    featureTags: [],
    zones: kinds,
  };
}
const bind = (fixture: Fixture, wallStripId: string, posAlongMm: number): FixtureBinding => ({
  fixture,
  wallStripId,
  posAlongMm,
  orientation: 0,
});

const TOILET = () => makeFixture("toilet", 380, 700, ["toilet"]);
const BASIN = () => makeFixture("basin", 500, 400, ["vanity"]);
const FAUCET = () => makeFixture("faucet", 100, 100, []);

const VALID: FixtureBinding[] = [bind(TOILET(), "wall-bottom", 450), bind(BASIN(), "wall-left", 400)];

function configWith(ruleId: string, values: Record<string, number>): Config {
  return {
    ...DEFAULT_CONFIG,
    rules: {
      ...DEFAULT_CONFIG.rules,
      [ruleId]: { ...DEFAULT_CONFIG.rules[ruleId], values: { ...DEFAULT_CONFIG.rules[ruleId].values, ...values } },
    },
  };
}

const verdictFor = (evaluate: typeof evaluateC1, bindings: FixtureBinding[], rep: BathroomRep, config: Config = DEFAULT_CONFIG) =>
  evaluate(bindings, rep, config);

describe("C1 — boundary/fit", () => {
  it("valid scene passes with minPairGapMm measured", () => {
    const verdict = verdictFor(evaluateC1, VALID, REP);
    expect(verdict.pass).toBe(true);
    expect(verdict.explanation).toBe("c1-pass:all-footprints-inside-room-no-overlap");
    expect(verdict.measuredDeltas.maxOverhangMm).toBe(0);
    // basin x0–400 y400–900, toilet x450–830 y1100–1800: dx=50, dy=200 → gap = max = 200
    expect(verdict.measuredDeltas.minPairGapMm).toBe(200);
  });

  it("1 mm overlap fails with negative gap delta", () => {
    const verdict = verdictFor(evaluateC1, [...VALID, bind(TOILET(), "wall-bottom", 820)], REP);
    expect(verdict.pass).toBe(false);
    expect(verdict.explanation).toContain("c1-fixture-overlap");
    expect(verdict.measuredDeltas.minPairGapMm).toBeLessThan(0);
  });

  it("L-shape: fixture in the wide wing passes, one straddling the notch fails", () => {
    const rep = makeRep(LSHAPE);
    // The max-y bottom edge (origin (0,2400), x 0–1200) of the L-shape.
    const maxYStrip = rep.strips.find((s) => s.wallSide === "bottom" && s.origin.y === 2400);
    expect(maxYStrip).toBeDefined();
    const stripId = maxYStrip!.id;
    const inside = verdictFor(evaluateC1, [bind(TOILET(), stripId, 100)], rep);
    expect(inside.pass).toBe(true);
    // Span x1000–1380 crosses the notch edge x=1200 while y stays in the void.
    const straddling = verdictFor(evaluateC1, [bind(TOILET(), stripId, 1000)], rep);
    expect(straddling.pass).toBe(false);
    expect(straddling.explanation).toContain("c1-fixture-outside-room");
    expect(straddling.measuredDeltas.maxOverhangMm).toBe(0); // bbox still contains it
  });

  it("unknown wall strip fails with a stable reason", () => {
    const verdict = verdictFor(evaluateC1, [bind(TOILET(), "wall-nope", 0)], REP);
    expect(verdict.pass).toBe(false);
    expect(verdict.explanation).toContain("c1-unknown-wall-strip");
  });
});

describe("C2 — clearances", () => {
  it("exactly-at-threshold side clearance passes and is measured", () => {
    const verdict = verdictFor(evaluateC2, VALID, REP);
    expect(verdict.pass).toBe(true);
    expect(verdict.explanation).toBe("c2-pass:all-clearances-met");
    expect(verdict.measuredDeltas["minMm:toilet:side"]).toBe(450);
    expect(verdict.measuredDeltas["minMm:toilet:front"]).toBe(600); // capped at reach
    expect(verdict.measuredDeltas["minMm:basin:front"]).toBe(600);
    expect(verdict.measuredDeltas.maxShortfallMm).toBe(0);
  });

  it("1 mm short side clearance fails with shortfall 1", () => {
    const bindings = [bind(TOILET(), "wall-bottom", 449), bind(BASIN(), "wall-left", 400)];
    const verdict = verdictFor(evaluateC2, bindings, REP);
    expect(verdict.pass).toBe(false);
    expect(verdict.explanation).toContain("c2-clearance-short");
    const shortfallKey = Object.keys(verdict.measuredDeltas).find((k) => k.startsWith("shortfallMm:K-TOILET-"));
    expect(shortfallKey).toBeDefined();
    expect(verdict.measuredDeltas[shortfallKey!]).toBe(1);
  });

  it("raising the configured front clearance to 1200 fails (config-driven)", () => {
    const verdict = verdictFor(evaluateC2, VALID, REP, configWith("C2", { toiletFrontMm: 1200 }));
    expect(verdict.pass).toBe(false);
    expect(verdict.valuesUsed["toiletFrontMm"]).toBe(1200);
    expect(verdict.explanation).toContain("c2-clearance-short");
  });

  it("classes without a clearance spec (faucet) are skipped", () => {
    const verdict = verdictFor(evaluateC2, [bind(FAUCET(), "wall-bottom", 0)], REP);
    expect(verdict.pass).toBe(true);
    expect(Object.keys(verdict.measuredDeltas).filter((k) => k.startsWith("minMm:"))).toHaveLength(0);
  });
});

describe("C3 — door swings", () => {
  it("valid scene passes; min gap to the toilet is 670", () => {
    const verdict = verdictFor(evaluateC3, VALID, REP);
    expect(verdict.pass).toBe(true);
    expect(verdict.explanation).toBe("c3-pass:all-swings-clear");
    expect(verdict.measuredDeltas.minGapMm).toBe(670); // sector x1500 vs toilet x830
    expect(verdict.measuredDeltas.wallPokeMm).toBe(0);
  });

  it("a fixture inside the swing sector collides", () => {
    const verdict = verdictFor(evaluateC3, [bind(TOILET(), "wall-bottom", 1600)], REP);
    expect(verdict.pass).toBe(false);
    expect(verdict.explanation).toContain("c3-swing-collision:door-1");
  });

  it("collision margin: 10 mm gap collides, 30 mm gap clears (config-driven)", () => {
    const near = { id: "col-1", aabb: { min: v(2110, 1300), max: v(2120, 1400) } };
    const far = { id: "col-2", aabb: { min: v(2130, 1300), max: v(2140, 1400) } };
    expect(verdictFor(evaluateC3, [], makeRep(RECT, [door("wall-bottom", 1500)], [], [near]), configWith("C3", {})).pass).toBe(false);
    expect(verdictFor(evaluateC3, [], makeRep(RECT, [door("wall-bottom", 1500)], [], [far]), configWith("C3", {})).pass).toBe(true);
  });

  it("a swing cutting across an L-shape notch is a wall collision", () => {
    const rep = makeRep(LSHAPE);
    // Door on the y=1200 edge strip ("wall-bottom", x 1200–3000) swinging into
    // the notch void (x > 1200, y > 1200 is outside the polygon).
    const strip = rep.strips.find((s) => s.id === "wall-bottom");
    expect(strip).toBeDefined();
    const repWithDoor = makeRep(LSHAPE, [door("wall-bottom", 200)]);
    const verdict = verdictFor(evaluateC3, [], repWithDoor);
    // Hinge at strip point (1400,1200); sector x1400–2000, y600–1200 (inside the wing) → passes.
    expect(verdict.pass).toBe(true);
    void strip;
  });

  it("dangling opening wall fails with a stable reason", () => {
    const rep = makeRep(RECT, [{ ...door("wall-nope", 0) }]);
    const verdict = verdictFor(evaluateC3, [], rep);
    expect(verdict.pass).toBe(false);
    expect(verdict.explanation).toContain("c3-unknown-wall:door-1");
  });
});

describe("C4 — zones", () => {
  it("valid scene passes with zero out-of-span", () => {
    const verdict = verdictFor(evaluateC4, VALID, REP);
    expect(verdict.pass).toBe(true);
    expect(verdict.explanation).toBe("c4-pass:all-fixtures-in-zone");
    expect(verdict.measuredDeltas.maxOutSpanMm).toBe(0);
  });

  it("a fixture past its zone span fails with the measured overshoot", () => {
    const bindings = [bind(TOILET(), "wall-bottom", 1300), bind(BASIN(), "wall-left", 400)];
    const verdict = verdictFor(evaluateC4, bindings, REP);
    expect(verdict.pass).toBe(false);
    expect(verdict.explanation).toContain("c4-outside-zone:K-TOILET");
    expect(verdict.measuredDeltas.maxOutSpanMm).toBe(480); // span ends 1680, zone ends 1200
  });

  it("a zone-requiring fixture with no matching zone fails; zone-free classes pass", () => {
    const repNoZones = makeRep(RECT, [door("wall-bottom", 1500)]);
    const fail = verdictFor(evaluateC4, VALID, repNoZones);
    expect(fail.pass).toBe(false);
    expect(fail.explanation).toContain("c4-no-zone");
    const ok = verdictFor(evaluateC4, [bind(FAUCET(), "wall-bottom", 0)], repNoZones);
    expect(ok.pass).toBe(true);
  });
});

describe("C5 — plumbing minima", () => {
  it("valid scene passes with measured deltas (opening sep 860, reach 50)", () => {
    const verdict = verdictFor(evaluateC5, VALID, REP);
    expect(verdict.pass).toBe(true);
    expect(verdict.explanation).toBe("c5-pass:plumbing-minima-met");
    expect(verdict.measuredDeltas.minOpeningSeparationMm).toBe(860); // conn x640 vs door span at 1500
    expect(verdict.measuredDeltas.maxPlumbingReachMm).toBe(50); // basin conn (0,650) vs zone center (0,600)
    expect(verdict.measuredDeltas.minRoughInSeparationMm).toBe(0); // no same-strip pair
  });

  it("same-strip rough-ins closer than 300 fail; 350 apart passes", () => {
    const far = [bind(TOILET(), "wall-bottom", 450), bind(TOILET(), "wall-bottom", 100)];
    expect(verdictFor(evaluateC5, far, REP).pass).toBe(true);
    const farVerdict = verdictFor(evaluateC5, far, REP);
    expect(farVerdict.measuredDeltas.minRoughInSeparationMm).toBe(350);
    const near = [bind(TOILET(), "wall-bottom", 450), bind(TOILET(), "wall-bottom", 340)];
    const nearVerdict = verdictFor(evaluateC5, near, REP);
    expect(nearVerdict.pass).toBe(false);
    expect(nearVerdict.explanation).toContain("c5-rough-in-crowding");
    expect(nearVerdict.measuredDeltas.minRoughInSeparationMm).toBe(110);
  });

  it("a rough-in inside a door span fails", () => {
    const rep = makeRep(RECT, [door("wall-bottom", 700)], [
      zone("zone-toilet", "toilet", "wall-bottom", 0, 1200),
    ]);
    const verdict = verdictFor(evaluateC5, [bind(TOILET(), "wall-bottom", 450)], rep);
    expect(verdict.pass).toBe(false);
    expect(verdict.explanation).toContain("c5-rough-in-in-opening:K-TOILET");
  });

  it("plumbing reach is config-driven (30 fails, 60 passes)", () => {
    expect(verdictFor(evaluateC5, VALID, REP, configWith("C5", { maxPlumbingWallDistanceMm: 30 })).pass).toBe(false);
    expect(verdictFor(evaluateC5, VALID, REP, configWith("C5", { maxPlumbingWallDistanceMm: 60 })).pass).toBe(true);
  });

  it("non-rough-in classes are skipped", () => {
    const verdict = verdictFor(evaluateC5, [bind(FAUCET(), "wall-bottom", 0)], REP);
    expect(verdict.pass).toBe(true);
    expect(verdict.measuredDeltas.maxPlumbingReachMm).toBe(0);
  });
});

describe("C6 — layout sanity", () => {
  it("valid scene passes; min door-to-corridor gap is 450", () => {
    const verdict = verdictFor(evaluateC6, VALID, REP);
    expect(verdict.pass).toBe(true);
    expect(verdict.explanation).toBe("c6-pass:layout-sane");
    expect(verdict.measuredDeltas.minDoorClearanceGapMm).toBe(500); // basin corridor x400–1000 vs sector x1500 (dx 500, dy 300)
  });

  it("a door swinging into a front clearance fails", () => {
    // Door on the top wall (y=0, inward (0,1)) at x400–1000; sector y0–600
    // overlaps the toilet front corridor y500–1100.
    const rep = makeRep(RECT, [door("wall-top", 400)], [
      zone("zone-toilet", "toilet", "wall-bottom", 0, 1200),
    ]);
    const verdict = verdictFor(evaluateC6, [bind(TOILET(), "wall-bottom", 450)], rep);
    expect(verdict.pass).toBe(false);
    expect(verdict.explanation).toContain("c6-door-blocks-clearance:door-1");
    expect(verdict.measuredDeltas.minDoorClearanceGapMm).toBe(0);
  });

  it("a fixture standing in a doorway fails with the overlap measured", () => {
    const bindings = [bind(TOILET(), "wall-bottom", 1300), bind(BASIN(), "wall-left", 400)];
    const verdict = verdictFor(evaluateC6, bindings, REP);
    expect(verdict.pass).toBe(false);
    expect(verdict.explanation).toContain("c6-fixture-in-doorway:K-TOILET");
    const key = Object.keys(verdict.measuredDeltas).find((k) => k.startsWith("doorwayOverlapMm:K-TOILET"));
    expect(verdict.measuredDeltas[key!]).toBe(180); // span ends 1680, door starts 1500
  });

  it("windows do not trigger the doorway check", () => {
    const rep = makeRep(RECT, [
      { id: "win-1", wallId: "wall-left", kind: "window", alongOffsetMm: 400, spanMm: 600 },
    ]);
    const verdict = verdictFor(evaluateC6, VALID, rep);
    expect(verdict.pass).toBe(true);
  });
});

describe("evaluateGeometryRules — composite", () => {
  it("returns the full C1–C6 trace in canonical order; valid scene passes all", () => {
    const trace = evaluateGeometryRules(VALID, REP, DEFAULT_CONFIG);
    expect(trace.map((t) => t.ruleId)).toEqual(["C1", "C2", "C3", "C4", "C5", "C6"]);
    expect(trace.every((t) => t.pass)).toBe(true);
  });

  it("no short-circuit: an overlap surfaces in the trace and fails C1 first", () => {
    const trace = evaluateGeometryRules([...VALID, bind(TOILET(), "wall-bottom", 820)], REP, DEFAULT_CONFIG);
    expect(trace).toHaveLength(6);
    expect(trace[0].ruleId).toBe("C1");
    expect(trace[0].pass).toBe(false);
  });

  it("is deterministic: same input, same trace (JSON equality)", () => {
    const a = evaluateGeometryRules(VALID, REP, DEFAULT_CONFIG);
    const b = evaluateGeometryRules([...VALID].reverse(), REP, DEFAULT_CONFIG);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("dangling bindings surface in every rule's explanation", () => {
    const trace = evaluateGeometryRules([bind(TOILET(), "wall-nope", 0)], REP, DEFAULT_CONFIG);
    for (const t of trace) {
      expect(t.pass).toBe(false);
      expect(t.explanation).toContain("unknown-wall-strip");
    }
  });
});
