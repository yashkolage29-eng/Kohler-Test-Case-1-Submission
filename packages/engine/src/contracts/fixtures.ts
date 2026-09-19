// Compile-time fixtures — one minimal valid instance per major contract. These exist to
// prove the contract graph is constructible end-to-end under `tsc` (T-002 acceptance:
// "contract fixture compilation"). They are NOT runtime seed data.

import type {
  AABB,
  BathroomRep,
  Opening,
  RoomPolygon,
  Vec2,
  WallStrip,
  Zone,
} from "./geometry.js";
import type { FeatureConstraints, InputSet } from "./input.js";
import type { Candidate, Fixture, FixtureBinding } from "./candidate.js";
import type {
  BOM,
  BudgetSummary,
  BuildOutput,
  LineItem,
  Plan,
  ReoptChange,
  RelaxationPlan,
} from "./plan.js";
import type { DecisionReceipt, RuleVerdict, ValidationResult } from "./receipt.js";
import type { PlacedFixtureRender, RenderAnnotation, RenderGeometry } from "./render.js";
import type { Config } from "../config/config-types.js";
import { DEFAULT_CONFIG } from "../config/config.js";

const v = (x: number, y: number): Vec2 => ({ x, y });
const aabb = (x0: number, y0: number, x1: number, y1: number): AABB => ({
  min: v(x0, y0),
  max: v(x1, y1),
});

export const fixtureRoomPolygon: RoomPolygon = {
  vertices: [v(0, 0), v(1500, 0), v(1500, 1800), v(0, 1800)], // OPT §16 example room
  ccw: true,
  wallThicknessMm: 100,
};

export const fixtureOpening: Opening = {
  id: "door-1",
  wallId: "wall-bottom",
  kind: "door",
  alongOffsetMm: 900,
  spanMm: 600,
  swing: { side: "in", leafDimsMm: { w: 600, d: 25 } },
};

export const fixtureWallStrip: WallStrip = {
  id: "wall-bottom",
  wallSide: "bottom",
  origin: v(0, 1800),
  direction: v(1, 0),
  usableLengthMm: 900, // 1500 minus 600 door keep-clear
};

export const fixtureZone: Zone = {
  id: "zone-toilet",
  kind: "toilet",
  wallStripId: "wall-bottom",
  spanStartMm: 0,
  spanEndMm: 900,
};

export const fixtureBathroomRep: BathroomRep = {
  polygon: fixtureRoomPolygon,
  strips: [fixtureWallStrip],
  openings: [fixtureOpening],
  plumbingZones: [fixtureZone],
  obstacles: [],
  slotGridMm: 25,
};

export const fixtureRuleVerdict: RuleVerdict = {
  ruleId: "C2",
  pass: true,
  valuesUsed: { toiletFrontMm: 600 },
  measuredDeltas: { frontClearanceMm: 650 },
  explanation: "Front clearance 650 mm ≥ required 600 mm.",
};

export const fixtureValidationResult: ValidationResult = {
  trace: [fixtureRuleVerdict],
  pass: true,
};

export const fixtureFeatureConstraints: FeatureConstraints = {
  requiredFeatures: ["dual_flush", "floor_mount"],
  preferredClasses: ["toilet", "basin"],
  finishFamilies: ["white", "chrome"],
  tone: "modern, spa, mid-budget",
  classCountRanges: { toilet: { min: 1, max: 1 }, basin: { min: 1, max: 1 } },
};

export const fixtureInput: InputSet = {
  polygon: fixtureRoomPolygon,
  openings: [fixtureOpening],
  confirmed: true,
  featureConstraints: fixtureFeatureConstraints,
  priority: "value",
  spaciousness: "compact",
  budget: { bMax: 300000, bTarget: 250000 },
  config: DEFAULT_CONFIG,
};


export const fixtureCandidateFixture: Fixture = {
  skuId: "K-EXAMPLE-0",
  class: "toilet",
  footprintMm: { w: 380, d: 700, h: 780 },
  classAffinity: ["toilet"],
  orientation: 0,
  featureTags: ["dual_flush", "floor_mount", "elongated"],
  zones: ["toilet"],
};

export const fixtureBinding: FixtureBinding = {
  fixture: fixtureCandidateFixture,
  wallStripId: "wall-bottom",
  posAlongMm: 0,
  orientation: 0,
};

export const fixtureCandidate: Candidate = {
  id: "K-EXAMPLE-0",
  classSet: ["toilet"],
  bindings: [fixtureBinding],
  cost: 25000,
  clearanceDeltas: { toiletFrontMm: 50 },
  compatOk: true,
  geometryValid: true,
};

export const fixtureLineItem: LineItem = {
  model_id: "K-EXAMPLE-0",
  qty: 1,
  finish: "white",
  price: 25000,
};

export const fixtureBOM: BOM = {
  lineItems: [fixtureLineItem],
  total: 25000,
  byZone: { toilet: [fixtureLineItem] },
};

export const fixtureBudgetSummary: BudgetSummary = {
  total: 25000,
  bTarget: 250000,
  bMax: 300000,
};

export const fixtureDecisionReceipt: DecisionReceipt = {
  topK: [
    {
      candidateId: fixtureCandidate.id,
      total: 0.72,
      perTerm: { uCost: 0.9, uSpace: 0.6, uWater: 0.5, uLuxury: 0.4, uMaintenance: 0.8 },
    },
  ],
  scoreMatrix: {
    "K-EXAMPLE-0": { uCost: 0.9, uSpace: 0.6, uWater: 0.5, uLuxury: 0.4, uMaintenance: 0.8 },
  },
  firedRuleTrace: [fixtureRuleVerdict],
  dataGaps: [],
  honestyFrame:
    "Planning-level rules, curated catalog — verify with a licensed professional.",
};

export const fixturePlan: Plan = {
  id: "plan-001",
  selectedCandidate: fixtureCandidate,
  firedTrace: [fixtureRuleVerdict],
  perTermScores: { uCost: 0.9, uSpace: 0.6, uWater: 0.5, uLuxury: 0.4, uMaintenance: 0.8 },
  cost: 25000,
  bom: fixtureBOM,
  budgetSummary: fixtureBudgetSummary,
  receipt: fixtureDecisionReceipt,
};

export const fixtureRelaxationPlan: RelaxationPlan = {
  kind: "drop-class",
  tradeoffDelta: "Drops the tub class; frees 1700 mm of wall length; cost unchanged.",
  plan: fixturePlan,
};

export const fixtureBuildOutputPlan: BuildOutput = { kind: "plan", plan: fixturePlan };
export const fixtureBuildOutputRelaxation: BuildOutput = {
  kind: "relaxation",
  menu: [fixtureRelaxationPlan],
};
export const fixtureBuildOutputOutOfScope: BuildOutput = {
  kind: "out-of-scope",
  outOfScope: {
    finalBlocker: "C2 clearance infeasible in all wall orders",
    minViableCost: 38000,
  },
};

export const fixtureReoptChange: ReoptChange = { kind: "weights", priority: "luxury" };

export const fixturePlacedFixtureRender: PlacedFixtureRender = {
  modelId: "K-EXAMPLE-0",
  fixtureClass: "toilet",
  zoneKind: "toilet",
  aabb: aabb(100, 1200, 480, 1900),
  orientationDeg: 0,
  finish: "white",
};

export const fixtureRenderAnnotation: RenderAnnotation = {
  kind: "clearance",
  at: v(290, 1950),
  text: "front 650 ≥ 600 mm",
};

export const fixtureRenderGeometry: RenderGeometry = {
  polygon: fixtureRoomPolygon,
  openings: [fixtureOpening],
  fixtures: [fixturePlacedFixtureRender],
  annotations: [fixtureRenderAnnotation],
};

// Type-only proof that Config is constructible from the DEFAULT_CONFIG shape.
export const fixtureConfig: Config = DEFAULT_CONFIG;
