// T-004 curated demo catalog — tubs (SCHEMA §12: 5–6 SKUs, ₹25k–150k;
// ≥1 freestanding; ≥1 alcove floor_mount).
// Geometry: floor-back-center anchor, single `shell` primitive filling `dim`.
import type { SKU } from "../schema.js";

export const TUBS: SKU[] = [
  {
    model_id: "K-1123-0",
    name: "Archer 60-inch alcove bath",
    category: "Tubs",
    fixture_class: "tub",
    dim: { w: 1524, d: 762, h: 508 },
    finish_options: ["white"],
    price: 48000,
    geometry_descriptor: {
      anchor: "floor-back-center",
      primitives: [
        { part: "shell", kind: { shape: "box", sizeMm: { w: 1524, d: 762, h: 508 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["floor_mount"],
    compatibility: [],
    substitutionIds: [],
  },
  {
    model_id: "K-838-0",
    name: "Bellwether 60-inch cast iron alcove bath",
    category: "Tubs",
    fixture_class: "tub",
    dim: { w: 1524, d: 813, h: 419 },
    finish_options: ["white"],
    price: 95000,
    geometry_descriptor: {
      anchor: "floor-back-center",
      primitives: [
        { part: "shell", kind: { shape: "box", sizeMm: { w: 1524, d: 813, h: 419 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["floor_mount"],
    compatibility: [],
    substitutionIds: ["K-1123-0"],
  },
  {
    model_id: "K-1150-0",
    name: "Bancroft 60-inch alcove bath",
    category: "Tubs",
    fixture_class: "tub",
    dim: { w: 1524, d: 813, h: 570 },
    finish_options: ["white"],
    price: 55000,
    geometry_descriptor: {
      anchor: "floor-back-center",
      primitives: [
        { part: "shell", kind: { shape: "box", sizeMm: { w: 1524, d: 813, h: 570 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["floor_mount"],
    compatibility: [],
    substitutionIds: ["K-1123-0"],
  },
  {
    model_id: "K-1130-0",
    name: "Underscore 60-inch drop-in bath",
    category: "Tubs",
    fixture_class: "tub",
    dim: { w: 1524, d: 813, h: 559 },
    finish_options: ["white"],
    price: 62000,
    geometry_descriptor: {
      anchor: "floor-back-center",
      primitives: [
        { part: "shell", kind: { shape: "box", sizeMm: { w: 1524, d: 813, h: 559 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["deck_mount"],
    compatibility: [],
    substitutionIds: ["K-1123-0"],
  },
  {
    model_id: "K-6366-0",
    name: "Stargaze 72-inch freestanding bath",
    category: "Tubs",
    fixture_class: "tub",
    dim: { w: 1831, d: 899, h: 616 },
    finish_options: ["white"],
    price: 148000,
    geometry_descriptor: {
      anchor: "floor-back-center",
      primitives: [
        { part: "shell", kind: { shape: "box", sizeMm: { w: 1831, d: 899, h: 616 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["freestanding"],
    compatibility: [],
    substitutionIds: ["K-5712-0"],
  },
  {
    model_id: "K-5712-0",
    name: "Sunstruck 66-inch freestanding bath",
    category: "Tubs",
    fixture_class: "tub",
    dim: { w: 1676, d: 813, h: 610 },
    finish_options: ["white"],
    price: 125000,
    geometry_descriptor: {
      anchor: "floor-back-center",
      primitives: [
        { part: "shell", kind: { shape: "box", sizeMm: { w: 1676, d: 813, h: 610 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["freestanding"],
    compatibility: [],
    substitutionIds: ["K-1123-0"],
  },
];

