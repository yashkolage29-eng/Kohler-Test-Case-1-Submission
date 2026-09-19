// T-004 curated demo catalog — toilets (SCHEMA §12: 8–10 SKUs, ₹15k–90k;
// ≥2 low_flow/dual_flush; ≥2 smart incl. ≥1 wall_mount).
// Geometry convention (ADR-023/§6.1): floor-back-center SKUs use edge-origin
// (x=0 left edge, z=0 at wall, y=0 at floor; union of primitives fills `dim`).
// Wall-face-center SKUs use a centered-x local frame at the installed location.
import type { SKU } from "../schema.js";

export const TOILETS: SKU[] = [
  {
    model_id: "K-3889-0",
    name: "Cimarron Comfort Height two-piece elongated toilet",
    category: "Toilets",
    fixture_class: "toilet",
    dim: { w: 375, d: 725, h: 785 },
    finish_options: ["white"],
    price: 27500,
    geometry_descriptor: {
      anchor: "floor-back-center",
      primitives: [
        { part: "bowl", kind: { shape: "box", sizeMm: { w: 375, d: 540, h: 400 } }, offsetMm: { x: 0, y: 0, z: 185 }, finishable: true },
        { part: "seat", kind: { shape: "box", sizeMm: { w: 375, d: 540, h: 30 } }, offsetMm: { x: 0, y: 395, z: 185 }, finishable: true },
        { part: "tank", kind: { shape: "box", sizeMm: { w: 375, d: 185, h: 785 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    water: { flushLiters: 4.8 },
    feature_tags: ["floor_mount", "elongated", "comfort_height", "low_flow"],
    compatibility: [],
    substitutionIds: ["K-3654-0"],
  },
  {
    model_id: "K-3999-0",
    name: "Highline Comfort Height two-piece elongated toilet",
    category: "Toilets",
    fixture_class: "toilet",
    dim: { w: 465, d: 705, h: 800 },
    finish_options: ["white"],
    price: 21500,
    geometry_descriptor: {
      anchor: "floor-back-center",
      primitives: [
        { part: "bowl", kind: { shape: "box", sizeMm: { w: 465, d: 515, h: 420 } }, offsetMm: { x: 0, y: 0, z: 190 }, finishable: true },
        { part: "seat", kind: { shape: "box", sizeMm: { w: 465, d: 515, h: 30 } }, offsetMm: { x: 0, y: 415, z: 190 }, finishable: true },
        { part: "tank", kind: { shape: "box", sizeMm: { w: 465, d: 190, h: 800 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    water: { flushLiters: 4.8 },
    feature_tags: ["floor_mount", "elongated", "comfort_height", "low_flow"],
    compatibility: [],
    substitutionIds: ["K-3889-0"],
  },
  {
    model_id: "K-3654-0",
    name: "Persuade two-piece elongated dual-flush toilet",
    category: "Toilets",
    fixture_class: "toilet",
    dim: { w: 360, d: 695, h: 790 },
    finish_options: ["white"],
    price: 32000,
    geometry_descriptor: {
      anchor: "floor-back-center",
      primitives: [
        { part: "bowl", kind: { shape: "box", sizeMm: { w: 360, d: 515, h: 400 } }, offsetMm: { x: 0, y: 0, z: 180 }, finishable: true },
        { part: "seat", kind: { shape: "box", sizeMm: { w: 360, d: 515, h: 30 } }, offsetMm: { x: 0, y: 395, z: 180 }, finishable: true },
        { part: "tank", kind: { shape: "box", sizeMm: { w: 360, d: 180, h: 790 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    water: { flushLiters: 6, flushLightLiters: 3, dualFlush: true },
    feature_tags: ["floor_mount", "elongated", "dual_flush"],
    compatibility: [],
    substitutionIds: [],
  },
  {
    model_id: "K-4000-0",
    name: "San Souci one-piece elongated toilet",
    category: "Toilets",
    fixture_class: "toilet",
    dim: { w: 425, d: 708, h: 760 },
    finish_options: ["white"],
    price: 44500,
    geometry_descriptor: {
      anchor: "floor-back-center",
      primitives: [
        { part: "bowl", kind: { shape: "box", sizeMm: { w: 425, d: 518, h: 410 } }, offsetMm: { x: 0, y: 0, z: 190 }, finishable: true },
        { part: "seat", kind: { shape: "box", sizeMm: { w: 425, d: 518, h: 30 } }, offsetMm: { x: 0, y: 405, z: 190 }, finishable: true },
        { part: "tank", kind: { shape: "box", sizeMm: { w: 425, d: 190, h: 760 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    water: { flushLiters: 4.8 },
    feature_tags: ["floor_mount", "elongated", "comfort_height", "low_flow", "soft_close"],
    compatibility: [],
    substitutionIds: ["K-3889-0"],
  },
  {
    model_id: "K-6669-0",
    name: "Memoirs Stately Comfort Height two-piece elongated toilet",
    category: "Toilets",
    fixture_class: "toilet",
    dim: { w: 455, d: 745, h: 790 },
    finish_options: ["white"],
    price: 39500,
    geometry_descriptor: {
      anchor: "floor-back-center",
      primitives: [
        { part: "bowl", kind: { shape: "box", sizeMm: { w: 455, d: 550, h: 420 } }, offsetMm: { x: 0, y: 0, z: 195 }, finishable: true },
        { part: "seat", kind: { shape: "box", sizeMm: { w: 455, d: 550, h: 30 } }, offsetMm: { x: 0, y: 415, z: 195 }, finishable: true },
        { part: "tank", kind: { shape: "box", sizeMm: { w: 455, d: 195, h: 790 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    water: { flushLiters: 4.8 },
    feature_tags: ["floor_mount", "elongated", "comfort_height", "low_flow"],
    compatibility: [],
    substitutionIds: ["K-3980-0"],
  },
  {
    model_id: "K-3980-0",
    name: "Tresham Comfort Height two-piece elongated toilet",
    category: "Toilets",
    fixture_class: "toilet",
    dim: { w: 400, d: 710, h: 780 },
    finish_options: ["white"],
    price: 36500,
    geometry_descriptor: {
      anchor: "floor-back-center",
      primitives: [
        { part: "bowl", kind: { shape: "box", sizeMm: { w: 400, d: 525, h: 410 } }, offsetMm: { x: 0, y: 0, z: 185 }, finishable: true },
        { part: "seat", kind: { shape: "box", sizeMm: { w: 400, d: 525, h: 30 } }, offsetMm: { x: 0, y: 405, z: 185 }, finishable: true },
        { part: "tank", kind: { shape: "box", sizeMm: { w: 400, d: 185, h: 780 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    water: { flushLiters: 4.8 },
    feature_tags: ["floor_mount", "elongated", "comfort_height", "low_flow"],
    // Tresham collection pairing (§7.3 force edge; graph builds symmetric closure).
    compatibility: ["K-2606-F69"],
    substitutionIds: ["K-3889-0"],
  },
  {
    model_id: "K-5401-0",
    name: "Veil intelligent wall-hung toilet",
    category: "Smart Toilets",
    fixture_class: "toilet",
    dim: { w: 380, d: 565, h: 480 },
    finish_options: ["white"],
    price: 82000,
    geometry_descriptor: {
      anchor: "wall-face-center",
      // Local frame at installed location: SCHEMA §13.2's y:220 offset would exceed the
      // implemented §6.3 y window (maxY <= dim.h + 10), so the bowl sits at the origin.
      primitives: [
        { part: "bowl", kind: { shape: "box", sizeMm: { w: 380, d: 565, h: 480 } }, offsetMm: { x: -190, y: 0, z: 0 }, finishable: true },
      ],
    },
    water: { flushLiters: 4.5, flushLightLiters: 3, dualFlush: true },
    feature_tags: ["wall_mount", "smart", "bidet", "heated_seat", "self_cleaning", "dual_flush", "low_flow"],
    compatibility: [],
    substitutionIds: [],
  },
  {
    model_id: "K-8340-0",
    name: "Innate intelligent one-piece toilet",
    category: "Smart Toilets",
    fixture_class: "toilet",
    dim: { w: 410, d: 700, h: 640 },
    finish_options: ["white"],
    price: 78500,
    geometry_descriptor: {
      anchor: "floor-back-center",
      primitives: [
        { part: "bowl", kind: { shape: "box", sizeMm: { w: 410, d: 480, h: 420 } }, offsetMm: { x: 0, y: 0, z: 220 }, finishable: true },
        { part: "seat", kind: { shape: "box", sizeMm: { w: 410, d: 480, h: 30 } }, offsetMm: { x: 0, y: 415, z: 220 }, finishable: true },
        { part: "tank", kind: { shape: "box", sizeMm: { w: 410, d: 220, h: 640 } }, offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      ],
    },
    water: { flushLiters: 4.8, flushLightLiters: 3.4, dualFlush: true },
    feature_tags: ["floor_mount", "elongated", "smart", "bidet", "heated_seat", "dual_flush", "low_flow"],
    compatibility: [],
    // Smart-to-smart smaller-footprint swap (relaxation path, §8).
    substitutionIds: ["K-5401-0"],
  },
];
