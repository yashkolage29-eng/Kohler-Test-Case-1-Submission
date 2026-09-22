// T-027b curated aesthetic presets. Each preset is a closed, deterministic bundle of
// room materials, décor palette/items and a preferred finish family. The preferred finish
// is only a suggestion the UI feeds into the existing finish-family chips, so the engine
// still validates every product choice (AI/taste never overrides deterministic rules).
import type { DecorItemProposal, DecorStyle } from "./decor.js";
import type { FinishFamily, FixtureClass } from "./contracts/vocab.js";
import type { ProductType } from "./catalog/traits.js";

export const STYLE_PRESETS = [
  "minimalist-modern",
  "classic-luxury",
  "japanese-zen",
  "japanese-brutalism",
  "japandi",
  "scandinavian",
  "industrial-loft",
  "coastal",
  "dark-luxury",
] as const;
export type StylePreset = (typeof STYLE_PRESETS)[number];

export const FLOOR_MATERIALS = ["marble", "microcement", "hinoki", "oak", "white-oak", "herringbone", "granite"] as const;
export type FloorMaterial = (typeof FLOOR_MATERIALS)[number];
export const WALL_MATERIALS = ["paint", "concrete", "plaster", "limewash", "brick", "tile"] as const;
export type WallMaterial = (typeof WALL_MATERIALS)[number];

export interface StyleDefinition {
  key: StylePreset;
  label: string;
  blurb: string;
  palette: string[];
  metal: DecorStyle["metal"];
  lightTemp: DecorStyle["lightTemp"];
  floor: FloorMaterial;
  wall: WallMaterial;
  finishFamily: FinishFamily;
  /** T-028 preferred product form per class. The solver tries these first and falls back
   *  to the full catalog when no valid plan uses them (a preference, never a constraint).
   *  Vessel basins imply tall faucets through the basin×faucet compatibility default.
   *  Planning-level choices, pending product audit. */
  products: Partial<Record<FixtureClass, ProductType>>;
  /** Lower-case taste words; weight 3 words are unambiguous style names. */
  keywords: [string, number][];
  items: DecorItemProposal[];
  /** T-043: extra pieces, in order, added as the room grows (decorCaps); includes art and lights. */
  fillers: DecorItemProposal[];
}

export const STYLES: Record<StylePreset, StyleDefinition> = {
  "minimalist-modern": {
    key: "minimalist-modern",
    label: "Minimalist Modern",
    blurb: "Microcement, white walls, black accents, very little on show.",
    palette: ["#f4f3f0", "#d9d6d0", "#8c8c88", "#2e2e2e"],
    metal: "black",
    lightTemp: "neutral",
    floor: "microcement",
    wall: "paint",
    finishFamily: "matte_black",
    products: { basin: "wall-hung", toilet: "wall-hung", faucet: "single" },
    keywords: [["minimalist", 3], ["minimal", 2], ["modern", 1], ["clean", 1], ["sleek", 1], ["contemporary", 1]],
    items: [
      { type: "backlit-mirror", anchor: "above-basin", size: "m" },
      { type: "pendant", anchor: "ceiling-center", size: "s" },
      { type: "plant", anchor: "corner", size: "m" },
      { type: "vase", anchor: "on-vanity", size: "s" },
      { type: "towel", anchor: "beside-shower", size: "s" },
    ],
    fillers: [
      { type: "rug", anchor: "center-floor", size: "l" },
      { type: "art", anchor: "free-wall", size: "l" },
      { type: "floor-lamp", anchor: "corner", size: "m" },
      { type: "bath-mat", anchor: "beside-tub", size: "m" },
      { type: "cabinet", anchor: "free-wall", size: "m" },
      { type: "sculpture", anchor: "corner", size: "m" },
      { type: "led-strip", anchor: "above-vanity", size: "m" },
      { type: "side-table", anchor: "beside-tub", size: "s" },
      { type: "niche-shelf", anchor: "free-wall", size: "m" },
      { type: "art", anchor: "free-wall", size: "m" },
      { type: "bench", anchor: "center-floor", size: "m" },
      { type: "tub-tray", anchor: "beside-tub", size: "m" },
    ],
  },
  "classic-luxury": {
    key: "classic-luxury",
    label: "Classic Luxury",
    blurb: "White marble, brass, an ornate mirror and a chandelier.",
    palette: ["#f3ede2", "#c9a45c", "#1f2a36", "#6b4e3d"],
    metal: "brass",
    lightTemp: "warm",
    floor: "marble",
    wall: "paint",
    finishFamily: "brushed_gold",
    products: { basin: "undercounter", toilet: "one-piece", faucet: "widespread", tub: "freestanding" },
    keywords: [["luxury", 3], ["luxurious", 3], ["classic", 2], ["opulent", 2], ["glam", 2], ["elegant", 1], ["hotel", 1], ["gold", 1], ["brass", 1]],
    items: [
      { type: "mirror", anchor: "above-basin", size: "l" },
      { type: "sconce", anchor: "above-basin", size: "m" },
      { type: "chandelier", anchor: "ceiling-center", size: "m" },
      { type: "art", anchor: "free-wall", size: "l" },
      { type: "vase", anchor: "on-vanity", size: "l" },
      { type: "candles", anchor: "on-vanity", size: "m" },
      { type: "plant", anchor: "corner", size: "l" },
      { type: "rug", anchor: "above-vanity", size: "m" },
      { type: "towel", anchor: "beside-shower", size: "m" },
    ],
    fillers: [
      { type: "rug", anchor: "center-floor", size: "l" },
      { type: "floor-mirror", anchor: "free-wall", size: "m" },
      { type: "art", anchor: "free-wall", size: "l" },
      { type: "sconce", anchor: "free-wall", size: "m" },
      { type: "side-table", anchor: "beside-tub", size: "m" },
      { type: "tub-tray", anchor: "beside-tub", size: "m" },
      { type: "bath-mat", anchor: "beside-tub", size: "m" },
      { type: "bench", anchor: "center-floor", size: "m" },
      { type: "cabinet", anchor: "free-wall", size: "m" },
      { type: "art", anchor: "free-wall", size: "m" },
      { type: "plant", anchor: "corner", size: "m" },
      { type: "sculpture", anchor: "corner", size: "m" },
    ],
  },
  "japanese-zen": {
    key: "japanese-zen",
    label: "Japanese Zen",
    blurb: "Hinoki floor, clay plaster, a bonsai, lantern light and stillness.",
    palette: ["#e9e2d4", "#b89f7e", "#5b6b4f", "#2b2622"],
    metal: "black",
    lightTemp: "warm",
    floor: "hinoki",
    wall: "plaster",
    finishFamily: "matte_black",
    products: { basin: "vessel", toilet: "wall-hung", tub: "freestanding" },
    keywords: [["zen", 3], ["japanese", 2], ["onsen", 3], ["bonsai", 2], ["spa", 1], ["calm", 1], ["tranquil", 1], ["serene", 1]],
    items: [
      { type: "mirror", anchor: "above-basin", size: "m" },
      { type: "pendant", anchor: "ceiling-center", size: "m" },
      { type: "lantern", anchor: "corner", size: "m" },
      { type: "plant", anchor: "door-side", size: "m" },
      { type: "bowl", anchor: "on-vanity", size: "m" },
      { type: "stool", anchor: "beside-shower", size: "m" },
      { type: "art", anchor: "free-wall", size: "m" },
      { type: "towel", anchor: "beside-shower", size: "s" },
    ],
    fillers: [
      { type: "rug", anchor: "center-floor", size: "l" },
      { type: "lantern", anchor: "corner", size: "m" },
      { type: "art", anchor: "free-wall", size: "m" },
      { type: "bath-mat", anchor: "beside-tub", size: "m" },
      { type: "tub-tray", anchor: "beside-tub", size: "m" },
      { type: "bench", anchor: "center-floor", size: "m" },
      { type: "towel-ladder", anchor: "free-wall", size: "m" },
      { type: "plant", anchor: "corner", size: "l" },
      { type: "side-table", anchor: "beside-tub", size: "s" },
      { type: "niche-shelf", anchor: "free-wall", size: "m" },
      { type: "art", anchor: "free-wall", size: "s" },
      { type: "basket", anchor: "door-side", size: "m" },
    ],
  },
  "japanese-brutalism": {
    key: "japanese-brutalism",
    label: "Japanese Brutalism",
    blurb: "Board-formed concrete, dark stone, one plant and hard light.",
    palette: ["#bdbab3", "#8a8680", "#4a4843", "#d8cfc0"],
    metal: "black",
    lightTemp: "neutral",
    floor: "granite",
    wall: "concrete",
    finishFamily: "matte_black",
    products: { basin: "undercounter", toilet: "wall-hung", faucet: "single" },
    keywords: [["brutalism", 3], ["brutalist", 3], ["brutal", 2], ["concrete", 2], ["raw", 1], ["tadao", 3], ["monolithic", 2]],
    items: [
      { type: "mirror", anchor: "above-basin", size: "m" },
      { type: "pendant", anchor: "ceiling-center", size: "s" },
      { type: "plant", anchor: "corner", size: "l" },
      { type: "vase", anchor: "on-vanity", size: "m" },
      { type: "stool", anchor: "beside-shower", size: "m" },
      { type: "bench", anchor: "door-side", size: "m" },
    ],
    fillers: [
      { type: "rug", anchor: "center-floor", size: "l" },
      { type: "sculpture", anchor: "corner", size: "l" },
      { type: "art", anchor: "free-wall", size: "l" },
      { type: "floor-lamp", anchor: "corner", size: "m" },
      { type: "bath-mat", anchor: "beside-tub", size: "m" },
      { type: "side-table", anchor: "beside-tub", size: "m" },
      { type: "cabinet", anchor: "free-wall", size: "m" },
      { type: "niche-shelf", anchor: "free-wall", size: "m" },
      { type: "led-strip", anchor: "above-vanity", size: "m" },
      { type: "tub-tray", anchor: "beside-tub", size: "m" },
      { type: "art", anchor: "free-wall", size: "m" },
      { type: "plant", anchor: "corner", size: "m" },
    ],
  },
  japandi: {
    key: "japandi",
    label: "Japandi",
    blurb: "Warm oak, limewash, soft linen tones and handmade ceramics.",
    palette: ["#efe9df", "#c8b6a0", "#7d6b58", "#3e3a36"],
    metal: "black",
    lightTemp: "warm",
    floor: "oak",
    wall: "limewash",
    finishFamily: "matte_black",
    products: { basin: "vessel", toilet: "one-piece" },
    keywords: [["japandi", 3], ["wabi", 3], ["wabi-sabi", 3], ["organic", 1], ["warm minimal", 2], ["linen", 1]],
    items: [
      { type: "mirror", anchor: "above-basin", size: "m" },
      { type: "pendant", anchor: "ceiling-center", size: "m" },
      { type: "plant", anchor: "corner", size: "m" },
      { type: "vase", anchor: "on-vanity", size: "m" },
      { type: "bowl", anchor: "on-vanity", size: "s" },
      { type: "stool", anchor: "beside-shower", size: "m" },
      { type: "basket", anchor: "door-side", size: "m" },
      { type: "towel", anchor: "beside-shower", size: "m" },
      { type: "art", anchor: "free-wall", size: "m" },
    ],
    fillers: [
      { type: "rug", anchor: "center-floor", size: "l" },
      { type: "towel-ladder", anchor: "free-wall", size: "m" },
      { type: "art", anchor: "free-wall", size: "l" },
      { type: "floor-lamp", anchor: "corner", size: "m" },
      { type: "bath-mat", anchor: "beside-tub", size: "m" },
      { type: "tub-tray", anchor: "beside-tub", size: "m" },
      { type: "side-table", anchor: "beside-tub", size: "s" },
      { type: "laundry-basket", anchor: "door-side", size: "m" },
      { type: "plant", anchor: "corner", size: "l" },
      { type: "niche-shelf", anchor: "free-wall", size: "m" },
      { type: "bench", anchor: "center-floor", size: "m" },
      { type: "art", anchor: "free-wall", size: "s" },
    ],
  },
  scandinavian: {
    key: "scandinavian",
    label: "Scandinavian",
    blurb: "Pale oak, white walls, chrome and bright daylight.",
    palette: ["#ffffff", "#e8e4dd", "#a7b4a0", "#c9a27e"],
    metal: "chrome",
    lightTemp: "neutral",
    floor: "white-oak",
    wall: "paint",
    finishFamily: "chrome",
    products: { basin: "wall-hung", toilet: "one-piece", faucet: "single" },
    keywords: [["scandinavian", 3], ["scandi", 3], ["nordic", 3], ["hygge", 3], ["airy", 1], ["bright", 1]],
    items: [
      { type: "mirror", anchor: "above-basin", size: "m" },
      { type: "pendant", anchor: "ceiling-center", size: "m" },
      { type: "plant", anchor: "corner", size: "m" },
      { type: "basket", anchor: "door-side", size: "m" },
      { type: "stool", anchor: "beside-shower", size: "m" },
      { type: "towel", anchor: "beside-shower", size: "m" },
      { type: "vase", anchor: "on-vanity", size: "s" },
      { type: "art", anchor: "free-wall", size: "m" },
      { type: "rug", anchor: "above-vanity", size: "m" },
    ],
    fillers: [
      { type: "rug", anchor: "center-floor", size: "l" },
      { type: "towel-ladder", anchor: "free-wall", size: "m" },
      { type: "art", anchor: "free-wall", size: "l" },
      { type: "floor-lamp", anchor: "corner", size: "m" },
      { type: "laundry-basket", anchor: "door-side", size: "m" },
      { type: "bath-mat", anchor: "beside-tub", size: "m" },
      { type: "bench", anchor: "center-floor", size: "m" },
      { type: "plant", anchor: "corner", size: "l" },
      { type: "side-table", anchor: "beside-tub", size: "s" },
      { type: "art", anchor: "free-wall", size: "m" },
      { type: "niche-shelf", anchor: "free-wall", size: "m" },
      { type: "tub-tray", anchor: "beside-tub", size: "m" },
    ],
  },
  "industrial-loft": {
    key: "industrial-loft",
    label: "Industrial Loft",
    blurb: "Exposed brick, microcement, black metal and Edison light.",
    palette: ["#3a3a3a", "#8b5a3c", "#c7c2b8", "#1e1e1e"],
    metal: "black",
    lightTemp: "warm",
    floor: "microcement",
    wall: "brick",
    finishFamily: "matte_black",
    products: { basin: "undercounter", toilet: "two-piece", faucet: "widespread" },
    keywords: [["industrial", 3], ["loft", 3], ["brick", 2], ["warehouse", 2], ["exposed", 1], ["edison", 2]],
    items: [
      { type: "mirror", anchor: "above-basin", size: "m" },
      { type: "sconce", anchor: "above-basin", size: "m" },
      { type: "pendant", anchor: "ceiling-center", size: "m" },
      { type: "plant", anchor: "corner", size: "m" },
      { type: "stool", anchor: "beside-shower", size: "m" },
      { type: "shelf", anchor: "free-wall", size: "m" },
      { type: "art", anchor: "free-wall", size: "m" },
      { type: "towel", anchor: "beside-shower", size: "m" },
    ],
    fillers: [
      { type: "rug", anchor: "center-floor", size: "l" },
      { type: "floor-lamp", anchor: "corner", size: "m" },
      { type: "art", anchor: "free-wall", size: "l" },
      { type: "cabinet", anchor: "free-wall", size: "m" },
      { type: "towel-ladder", anchor: "free-wall", size: "m" },
      { type: "bath-mat", anchor: "beside-tub", size: "m" },
      { type: "side-table", anchor: "beside-tub", size: "m" },
      { type: "laundry-basket", anchor: "door-side", size: "m" },
      { type: "shelf", anchor: "free-wall", size: "m" },
      { type: "art", anchor: "free-wall", size: "m" },
      { type: "tub-tray", anchor: "beside-tub", size: "m" },
      { type: "plant", anchor: "corner", size: "l" },
    ],
  },
  coastal: {
    key: "coastal",
    label: "Coastal",
    blurb: "White tile, sea blues, woven baskets and nickel.",
    palette: ["#f6f4ef", "#9cc3d5", "#3c6e8f", "#d8c3a5"],
    metal: "nickel",
    lightTemp: "cool",
    floor: "herringbone",
    wall: "tile",
    finishFamily: "brushed_nickel",
    products: { basin: "undercounter", toilet: "two-piece", faucet: "single", tub: "alcove" },
    keywords: [["coastal", 3], ["beach", 3], ["seaside", 3], ["nautical", 3], ["ocean", 2], ["sea", 1], ["blue", 1]],
    items: [
      { type: "mirror", anchor: "above-basin", size: "m" },
      { type: "pendant", anchor: "ceiling-center", size: "m" },
      { type: "plant", anchor: "corner", size: "m" },
      { type: "basket", anchor: "door-side", size: "m" },
      { type: "vase", anchor: "on-vanity", size: "m" },
      { type: "stool", anchor: "beside-shower", size: "m" },
      { type: "towel", anchor: "beside-shower", size: "m" },
      { type: "rug", anchor: "above-vanity", size: "m" },
      { type: "art", anchor: "free-wall", size: "m" },
    ],
    fillers: [
      { type: "rug", anchor: "center-floor", size: "l" },
      { type: "art", anchor: "free-wall", size: "l" },
      { type: "towel-ladder", anchor: "free-wall", size: "m" },
      { type: "floor-lamp", anchor: "corner", size: "m" },
      { type: "laundry-basket", anchor: "door-side", size: "m" },
      { type: "bath-mat", anchor: "beside-tub", size: "m" },
      { type: "bench", anchor: "center-floor", size: "m" },
      { type: "plant", anchor: "corner", size: "l" },
      { type: "side-table", anchor: "beside-tub", size: "s" },
      { type: "art", anchor: "free-wall", size: "m" },
      { type: "tub-tray", anchor: "beside-tub", size: "m" },
      { type: "niche-shelf", anchor: "free-wall", size: "m" },
    ],
  },
  "dark-luxury": {
    key: "dark-luxury",
    label: "Dark Luxury",
    blurb: "Charcoal stone, graphite walls, matte black and warm-gold accents.",
    palette: ["#1c1c1e", "#3a3a3c", "#b08d57", "#6b4e3d"],
    metal: "black",
    lightTemp: "warm",
    floor: "granite",
    wall: "paint",
    finishFamily: "matte_black",
    products: { basin: "vessel", toilet: "wall-hung", tub: "freestanding" },
    keywords: [["dark", 2], ["moody", 3], ["noir", 3], ["gothic", 3], ["charcoal", 2], ["graphite", 2], ["midnight", 2], ["dramatic", 1]],
    items: [
      { type: "backlit-mirror", anchor: "above-basin", size: "m" },
      { type: "sconce", anchor: "above-basin", size: "m" },
      { type: "pendant", anchor: "ceiling-center", size: "m" },
      { type: "plant", anchor: "corner", size: "m" },
      { type: "candles", anchor: "on-vanity", size: "m" },
      { type: "vase", anchor: "on-vanity", size: "m" },
      { type: "art", anchor: "free-wall", size: "m" },
      { type: "towel", anchor: "beside-shower", size: "m" },
    ],
    fillers: [
      { type: "rug", anchor: "center-floor", size: "l" },
      { type: "floor-mirror", anchor: "free-wall", size: "m" },
      { type: "art", anchor: "free-wall", size: "l" },
      { type: "floor-lamp", anchor: "corner", size: "m" },
      { type: "led-strip", anchor: "above-vanity", size: "m" },
      { type: "side-table", anchor: "beside-tub", size: "m" },
      { type: "tub-tray", anchor: "beside-tub", size: "m" },
      { type: "bath-mat", anchor: "beside-tub", size: "m" },
      { type: "sculpture", anchor: "corner", size: "m" },
      { type: "cabinet", anchor: "free-wall", size: "m" },
      { type: "art", anchor: "free-wall", size: "m" },
      { type: "plant", anchor: "corner", size: "l" },
    ],
  },
};

/** Best keyword match for a taste brief (whole words; ties keep STYLE_PRESETS order). */
export function detectStylePreset(text: string): StylePreset | undefined {
  const t = ` ${text.toLowerCase().replace(/[^a-z-]+/g, " ")} `;
  let best: StylePreset | undefined;
  let bestScore = 0;
  for (const key of STYLE_PRESETS) {
    const score = STYLES[key].keywords.reduce((sum, [word, weight]) => sum + (t.includes(` ${word} `) ? weight : 0), 0);
    if (score > bestScore) {
      best = key;
      bestScore = score;
    }
  }
  return best;
}
