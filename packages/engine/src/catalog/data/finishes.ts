// SCHEMA §4 seed finishes table (values illustrative; finalize at curation, §12).
import type { Finish } from "../schema.js";

export const FINISHES: Finish[] = [
  { id: "white", label: "White", family: "white", luxuryPoints: 1, wearResistance: 4, swatchHex: "#F6F7F8" },
  { id: "chrome", label: "Chrome", family: "chrome", luxuryPoints: 2, wearResistance: 5, swatchHex: "#C9D1D4" },
  { id: "brushed_nickel", label: "Brushed Nickel", family: "brushed_nickel", luxuryPoints: 3, wearResistance: 4, swatchHex: "#A9AFB3" },
  { id: "matte_black", label: "Matte Black", family: "matte_black", luxuryPoints: 3, wearResistance: 3, swatchHex: "#23272A" },
  { id: "brushed_gold", label: "Brushed Gold", family: "brushed_gold", luxuryPoints: 3, wearResistance: 3, swatchHex: "#C8A96A" },
  { id: "vibrant_brushed_moderne_brass", label: "Vibrant Brushed Moderne Brass", family: "brushed_gold", luxuryPoints: 3, wearResistance: 3, swatchHex: "#BDA477" },
  { id: "white_stone", label: "White Stone", family: "stone", luxuryPoints: 3, wearResistance: 4, swatchHex: "#E8E6E1" },
];
