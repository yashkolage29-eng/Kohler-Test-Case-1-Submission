// T-004 curated demo catalog — basins (SCHEMA §12: 8–10 SKUs, ₹6k–40k;
// ≥2 wall_mount; ≥2 deck_mount countertop).
// Deck-mount SKUs: deck-center anchor, bowl fills `dim`. Wall-mount SKUs:
// wall-face-center, centered-x local frame. Pedestal: floor-back-center.
import type { SKU } from "../schema.js";

export const BASINS: SKU[] = [
  {
    model_id: "K-2210-0",
    name: "Caxton 17-inch undermount basin",
    category: "Basins",
    fixture_class: "basin",
    dim: { w: 432, d: 356, h: 191 },
    finish_options: ["white"],
    price: 9500,
    geometry_descriptor: {
      anchor: "deck-center",
      primitives: [
        
        { part: "rim", kind: { shape: "box", sizeMm: { w: 432, d: 356, h: 18 } }, offsetMm: { x: 12, y: 173, z: 12 }, finishable: true },{ part: "bowl", kind: { shape: "box", sizeMm: { w: 432, d: 356, h: 191 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["deck_mount"],
    compatibility: [],
    substitutionIds: [],
  },
  {
    model_id: "K-2882-0",
    name: "Verticyl oval undermount basin",
    category: "Basins",
    fixture_class: "basin",
    dim: { w: 438, d: 362, h: 216 },
    finish_options: ["white"],
    price: 11500,
    geometry_descriptor: {
      anchor: "deck-center",
      primitives: [
        
        { part: "rim", kind: { shape: "box", sizeMm: { w: 438, d: 362, h: 18 } }, offsetMm: { x: 12, y: 198, z: 12 }, finishable: true },{ part: "bowl", kind: { shape: "box", sizeMm: { w: 438, d: 362, h: 216 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["deck_mount"],
    compatibility: [],
    substitutionIds: ["K-2210-0"],
  },
  {
    model_id: "K-2355-0",
    name: "Archer undermount basin",
    category: "Basins",
    fixture_class: "basin",
    dim: { w: 505, d: 389, h: 191 },
    finish_options: ["white"],
    price: 12800,
    geometry_descriptor: {
      anchor: "deck-center",
      primitives: [
        
        { part: "rim", kind: { shape: "box", sizeMm: { w: 505, d: 389, h: 18 } }, offsetMm: { x: 12, y: 173, z: 12 }, finishable: true },{ part: "bowl", kind: { shape: "box", sizeMm: { w: 505, d: 389, h: 191 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["deck_mount"],
    // Archer collection pairing (§7.3 force edge; graph builds symmetric closure).
    compatibility: ["K-1123-0"],
    substitutionIds: ["K-2210-0"],
  },
  {
    model_id: "K-2660-0",
    name: "Vox rectangular vessel basin",
    category: "Basins",
    fixture_class: "basin",
    dim: { w: 584, d: 460, h: 105 },
    finish_options: ["white"],
    price: 18500,
    geometry_descriptor: {
      anchor: "deck-center",
      primitives: [
        
        { part: "rim", kind: { shape: "box", sizeMm: { w: 584, d: 460, h: 18 } }, offsetMm: { x: 12, y: 87, z: 12 }, finishable: true },{ part: "bowl", kind: { shape: "box", sizeMm: { w: 584, d: 460, h: 105 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["deck_mount"],
    compatibility: [],
    substitutionIds: ["K-2355-0"],
  },
  {
    model_id: "K-14800-0",
    name: "Vox oval vessel basin",
    category: "Basins",
    fixture_class: "basin",
    dim: { w: 600, d: 420, h: 110 },
    finish_options: ["white"],
    price: 16800,
    geometry_descriptor: {
      anchor: "deck-center",
      primitives: [
        
        { part: "rim", kind: { shape: "box", sizeMm: { w: 600, d: 420, h: 18 } }, offsetMm: { x: 12, y: 92, z: 12 }, finishable: true },{ part: "bowl", kind: { shape: "box", sizeMm: { w: 600, d: 420, h: 110 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["deck_mount"],
    compatibility: [],
    substitutionIds: ["K-2355-0"],
  },
  {
    model_id: "K-2699-4-0",
    name: "Bryant oval drop-in basin",
    category: "Basins",
    fixture_class: "basin",
    dim: { w: 479, d: 419, h: 203 },
    finish_options: ["white"],
    price: 12500,
    geometry_descriptor: {
      anchor: "deck-center",
      primitives: [
        
        { part: "rim", kind: { shape: "box", sizeMm: { w: 479, d: 419, h: 18 } }, offsetMm: { x: 12, y: 185, z: 12 }, finishable: true },{ part: "bowl", kind: { shape: "box", sizeMm: { w: 479, d: 419, h: 203 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["deck_mount"],
    compatibility: [],
    substitutionIds: ["K-2210-0"],
  },
  {
    model_id: "K-2005-0",
    name: "Kingston wall-mount basin",
    category: "Basins",
    fixture_class: "basin",
    dim: { w: 537, d: 464, h: 216 },
    finish_options: ["white"],
    price: 9800,
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "bowl", kind: { shape: "box", sizeMm: { w: 537, d: 464, h: 216 } }, offsetMm: { x: -268.5, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["wall_mount"],
    compatibility: [],
    substitutionIds: ["K-2210-0"],
  },
  {
    model_id: "K-1999-0",
    name: "Brenham wall-mount basin",
    category: "Basins",
    fixture_class: "basin",
    dim: { w: 502, d: 556, h: 190 },
    finish_options: ["white"],
    price: 8900,
    geometry_descriptor: {
      anchor: "wall-face-center",
      primitives: [
        { part: "bowl", kind: { shape: "box", sizeMm: { w: 502, d: 556, h: 190 } }, offsetMm: { x: -251, y: 0, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["wall_mount"],
    compatibility: [],
    substitutionIds: ["K-2005-0"],
  },
  {
    model_id: "K-2359-8-0",
    name: "Archer pedestal basin",
    category: "Basins",
    fixture_class: "basin",
    dim: { w: 610, d: 520, h: 880 },
    finish_options: ["white"],
    price: 24500,
    geometry_descriptor: {
      anchor: "floor-back-center",
      primitives: [
        { part: "pedestal", kind: { shape: "box", sizeMm: { w: 250, d: 330, h: 700 } }, offsetMm: { x: 180, y: 0, z: 95 }, finishable: true },
        { part: "bowl", kind: { shape: "box", sizeMm: { w: 610, d: 520, h: 180 } }, offsetMm: { x: 0, y: 700, z: 0 }, finishable: true },
      ],
    },
    feature_tags: ["floor_mount"],
    compatibility: [],
    substitutionIds: ["K-2005-0"],
  },
];
