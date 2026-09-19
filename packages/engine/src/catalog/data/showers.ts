// T-004 curated demo catalog — showers (SCHEMA §12: 8–10 SKUs, ₹8k–120k;
// ≥1 thermostatic + ≥1 rain_shower; ≥2 finish families).
// Geometry: wall-face-center anchor, centered-x local frame at the installed
// location (placement heights are rule-engine config, not catalog data).
import type { SKU } from "../schema.js";

export const SHOWERS: SKU[] = [
  {
    model_id: "K-10284-CP",
    name: "Forte multifunction showerhead",
    category: "Showers",
    fixture_class: "shower",
    dim: { w: 151, d: 150, h: 90 },
    finish_options: ["chrome", "brushed_nickel"],
    price: 8500,
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "head", kind: { shape: "cylinder", radiusMm: 75, hMm: 90 }, offsetMm: { x: 0, y: 0, z: 75 }, finishable: true },
      ],
    },
    water: { flowRateLpm: 9.5 },
    feature_tags: ["wall_mount"],
    compatibility: [],
    substitutionIds: ["K-15996-CP"],
  },
  {
    model_id: "K-15996-CP",
    name: "Flipside multifunction handshower",
    category: "Showers",
    fixture_class: "shower",
    dim: { w: 60, d: 80, h: 220 },
    finish_options: ["chrome", "brushed_nickel"],
    price: 11500,
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "head", kind: { shape: "box", sizeMm: { w: 60, d: 80, h: 220 } }, offsetMm: { x: -30, y: 0, z: 0 }, finishable: true },
      ],
    },
    water: { flowRateLpm: 9.5 },
    feature_tags: ["wall_mount"],
    compatibility: [],
    substitutionIds: [],
  },
  {
    model_id: "K-9245-CP",
    name: "Moxie showerhead with wireless speaker",
    category: "Showers",
    fixture_class: "shower",
    dim: { w: 128, d: 135, h: 100 },
    finish_options: ["chrome", "brushed_nickel"],
    price: 15500,
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "head", kind: { shape: "cylinder", radiusMm: 64, hMm: 100 }, offsetMm: { x: 0, y: 0, z: 68 }, finishable: true },
      ],
    },
    water: { flowRateLpm: 9.5 },
    feature_tags: ["wall_mount"],
    compatibility: [],
    substitutionIds: ["K-15996-CP"],
  },
  {
    model_id: "K-13688-CP",
    name: "Contemporary Round 8-inch rainhead with arm",
    category: "Showers",
    fixture_class: "shower",
    dim: { w: 203, d: 340, h: 60 },
    finish_options: ["chrome", "brushed_nickel", "matte_black"],
    price: 22000,
    priceByFinish: { matte_black: 24200, brushed_nickel: 23100 },
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "arm", kind: { shape: "box", sizeMm: { w: 20, d: 240, h: 20 } }, offsetMm: { x: -10, y: 35, z: 0 }, finishable: true },
        { part: "head", kind: { shape: "cylinder", radiusMm: 101, hMm: 50 }, offsetMm: { x: 0, y: 0, z: 240 }, finishable: true },
      ],
    },
    water: { flowRateLpm: 9.5 },
    feature_tags: ["wall_mount", "rain_shower"],
    compatibility: [],
    substitutionIds: ["K-10284-CP"],
  },
  {
    model_id: "K-13689-CP",
    name: "Contemporary Round 10-inch rainhead with arm",
    category: "Showers",
    fixture_class: "shower",
    dim: { w: 254, d: 370, h: 60 },
    finish_options: ["chrome", "brushed_nickel", "matte_black"],
    price: 28000,
    priceByFinish: { matte_black: 30500, brushed_nickel: 29400 },
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "arm", kind: { shape: "box", sizeMm: { w: 20, d: 250, h: 20 } }, offsetMm: { x: -10, y: 35, z: 0 }, finishable: true },
        { part: "head", kind: { shape: "cylinder", radiusMm: 127, hMm: 50 }, offsetMm: { x: 0, y: 0, z: 250 }, finishable: true },
      ],
    },
    water: { flowRateLpm: 9.5 },
    feature_tags: ["wall_mount", "rain_shower"],
    compatibility: [],
    substitutionIds: ["K-13688-CP"],
  },
  {
    model_id: "K-2973-KS-NA",
    name: "MasterShower 3/4-inch thermostatic valve",
    category: "Showers",
    fixture_class: "shower",
    dim: { w: 160, d: 90, h: 160 },
    // Rough-in valve: KOHLER sells it unfinished (NA). "chrome" is carried as the
    // nominal finish only to satisfy the non-empty finish_options invariant (§4);
    // trim pairing is a C7/rules concern. Flagged for trade-data verification.
    finish_options: ["chrome"],
    price: 52000,
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "valve", kind: { shape: "box", sizeMm: { w: 160, d: 90, h: 160 } }, offsetMm: { x: -80, y: 0, z: 0 } },
      ],
    },
    // Planning-level flow figure for the 3/4" thermostatic body; hand-verify (§12).
    water: { flowRateLpm: 45 },
    feature_tags: ["wall_mount", "thermostatic"],
    compatibility: [],
    substitutionIds: [],
  },
  {
    model_id: "K-TS14422-4-CP",
    name: "Purist Rite-Temp shower trim set",
    category: "Showers",
    fixture_class: "shower",
    dim: { w: 170, d: 275, h: 750 },
    finish_options: ["chrome", "brushed_nickel", "matte_black"],
    price: 24000,
    priceByFinish: { matte_black: 26200, brushed_nickel: 25100 },
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "valve", kind: { shape: "box", sizeMm: { w: 170, d: 15, h: 170 } }, offsetMm: { x: -85, y: 0, z: 0 }, finishable: true },
        { part: "stem", kind: { shape: "box", sizeMm: { w: 20, d: 20, h: 530 } }, offsetMm: { x: -10, y: 170, z: 5 }, finishable: true },
        { part: "head", kind: { shape: "cylinder", radiusMm: 75, hMm: 50 }, offsetMm: { x: 0, y: 700, z: 200 }, finishable: true },
      ],
    },
    water: { flowRateLpm: 9.5 },
    feature_tags: ["wall_mount"],
    compatibility: [],
    substitutionIds: ["K-10284-CP"],
  },
  {
    model_id: "K-72774-CP",
    name: "Artifacts single-function showerhead",
    category: "Showers",
    fixture_class: "shower",
    dim: { w: 140, d: 130, h: 95 },
    finish_options: ["chrome", "brushed_nickel", "brushed_gold"],
    price: 19500,
    priceByFinish: { brushed_nickel: 21000, brushed_gold: 23500 },
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "head", kind: { shape: "cylinder", radiusMm: 70, hMm: 95 }, offsetMm: { x: 0, y: 0, z: 60 }, finishable: true },
      ],
    },
    water: { flowRateLpm: 9.5 },
    feature_tags: ["wall_mount"],
    compatibility: [],
    substitutionIds: ["K-15996-CP"],
  },
  {
    model_id: "K-76465-CP",
    name: "HydroRail beam shower column with rainhead",
    category: "Showers",
    fixture_class: "shower",
    dim: { w: 240, d: 350, h: 1150 },
    finish_options: ["chrome", "brushed_nickel"],
    price: 38000,
    priceByFinish: { brushed_nickel: 40500 },
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "stem", kind: { shape: "box", sizeMm: { w: 40, d: 95, h: 1150 } }, offsetMm: { x: -20, y: 0, z: 0 }, finishable: true },
        { part: "head", kind: { shape: "cylinder", radiusMm: 120, hMm: 45 }, offsetMm: { x: 0, y: 1080, z: 230 }, finishable: true },
      ],
    },
    water: { flowRateLpm: 9.5 },
    feature_tags: ["wall_mount", "rain_shower"],
    compatibility: [],
    substitutionIds: ["K-13688-CP"],
  },
  {
    model_id: "K-76466T-CP",
    name: "HydroRail thermostatic shower column with rainhead",
    category: "Showers",
    fixture_class: "shower",
    dim: { w: 250, d: 360, h: 1100 },
    finish_options: ["chrome", "brushed_nickel"],
    // Planning-level estimate in the HydroRail family price band; trade-data
    // verification pending (§12). Authored so a single shower SKU can carry both
    // required tags rain_shower + thermostatic within the demo budget band.
    price: 46500,
    priceByFinish: { brushed_nickel: 49500 },
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "stem", kind: { shape: "box", sizeMm: { w: 40, d: 95, h: 1100 } }, offsetMm: { x: -20, y: 0, z: 0 }, finishable: true },
        { part: "head", kind: { shape: "cylinder", radiusMm: 125, hMm: 45 }, offsetMm: { x: 0, y: 1030, z: 230 }, finishable: true },
        { part: "valve", kind: { shape: "box", sizeMm: { w: 120, d: 60, h: 120 } }, offsetMm: { x: 40, y: 950, z: 40 }, finishable: true },
      ],
    },
    // Planning-level flow figure for the thermostatic column; hand-verify (§12).
    water: { flowRateLpm: 9.5 },
    feature_tags: ["wall_mount", "rain_shower", "thermostatic"],
    compatibility: [],
    substitutionIds: ["K-76465-CP", "K-26334IN-9-CP"],
  },
];
