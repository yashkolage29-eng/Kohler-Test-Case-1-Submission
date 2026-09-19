// T-004 curated demo catalog — accessories (SCHEMA §12: 5–8 SKUs, ₹1.5k–15k;
// mirrors/towel bars/tissue holders; ≥3 finish families).
// Geometry: wall-face-center anchor, centered-x local frame, single `body` part (§6.2).
import type { SKU } from "../schema.js";

export const ACCESSORIES: SKU[] = [
  {
    model_id: "K-14441-CP",
    name: "Purist 18-inch towel bar",
    category: "Accessories",
    fixture_class: "accessory",
    dim: { w: 457, d: 75, h: 60 },
    finish_options: ["chrome", "brushed_nickel", "matte_black"],
    price: 6500,
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "body", kind: { shape: "box", sizeMm: { w: 457, d: 75, h: 60 } }, offsetMm: { x: -228.5, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["wall_mount"],
    compatibility: [],
    substitutionIds: [],
  },
  {
    model_id: "K-14442-CP",
    name: "Purist 24-inch towel bar",
    category: "Accessories",
    fixture_class: "accessory",
    dim: { w: 610, d: 75, h: 60 },
    finish_options: ["chrome", "brushed_nickel", "matte_black"],
    price: 7500,
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "body", kind: { shape: "box", sizeMm: { w: 610, d: 75, h: 60 } }, offsetMm: { x: -305, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["wall_mount"],
    compatibility: [],
    substitutionIds: ["K-14441-CP"],
  },
  {
    model_id: "K-14434-CP",
    name: "Purist toilet tissue holder",
    category: "Accessories",
    fixture_class: "accessory",
    dim: { w: 170, d: 90, h: 60 },
    finish_options: ["chrome", "brushed_nickel", "matte_black"],
    price: 4200,
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "body", kind: { shape: "box", sizeMm: { w: 170, d: 90, h: 60 } }, offsetMm: { x: -85, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["wall_mount"],
    compatibility: [],
    substitutionIds: [],
  },
  {
    model_id: "K-14432-CP",
    name: "Purist towel ring",
    category: "Accessories",
    fixture_class: "accessory",
    dim: { w: 190, d: 70, h: 220 },
    finish_options: ["chrome", "brushed_nickel", "matte_black"],
    price: 4800,
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "body", kind: { shape: "box", sizeMm: { w: 190, d: 70, h: 220 } }, offsetMm: { x: -95, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["wall_mount"],
    compatibility: [],
    substitutionIds: [],
  },
  {
    model_id: "K-10554-CP",
    name: "Devonshire 18-inch towel bar",
    category: "Accessories",
    fixture_class: "accessory",
    dim: { w: 457, d: 80, h: 70 },
    finish_options: ["chrome", "brushed_nickel"],
    price: 5200,
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "body", kind: { shape: "box", sizeMm: { w: 457, d: 80, h: 70 } }, offsetMm: { x: -228.5, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["wall_mount"],
    compatibility: [],
    substitutionIds: ["K-14441-CP"],
  },
  {
    model_id: "K-99007-NA",
    name: "Verdera 24-inch mirrored cabinet",
    category: "Accessories",
    fixture_class: "accessory",
    dim: { w: 610, d: 130, h: 760 },
    // Anodized aluminum construction; brushed_nickel is the closest §3.2 family.
    // Approximation flagged for hand-verification (§12).
    finish_options: ["brushed_nickel"],
    price: 14500,
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "body", kind: { shape: "box", sizeMm: { w: 610, d: 130, h: 760 } }, offsetMm: { x: -305, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["wall_mount"],
    compatibility: [],
    substitutionIds: [],
  },
  {
    model_id: "K-72780-CP",
    name: "Artifacts 18-inch towel bar",
    category: "Accessories",
    fixture_class: "accessory",
    dim: { w: 457, d: 80, h: 75 },
    finish_options: ["chrome", "brushed_nickel", "brushed_gold"],
    price: 8900,
    priceByFinish: { brushed_nickel: 9500, brushed_gold: 10200 },
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "body", kind: { shape: "box", sizeMm: { w: 457, d: 80, h: 75 } }, offsetMm: { x: -228.5, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["wall_mount"],
    compatibility: [],
    substitutionIds: ["K-14441-CP"],
  },
];

