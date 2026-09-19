// T-028 product form types, derived deterministically from the authored catalog name and
// mounting tags. The catalog has no dedicated form/mount field yet (TODO from T-027a), so
// this is the single place that reads them. Used by the basin×faucet compatibility default
// and by style presets (styles.ts) as preferred product types.
import type { SKU } from "./schema.js";

export type ProductType =
  | "vessel"
  | "undercounter"
  | "wall-hung"
  | "one-piece"
  | "two-piece"
  | "tall"
  | "widespread"
  | "single"
  | "freestanding"
  | "alcove"
  | "drop-in";

/** Form type of a SKU, or null when its class/name carries none. */
export function productType(sku: SKU): ProductType | null {
  const name = sku.name.toLowerCase();
  const tags = sku.feature_tags;
  switch (sku.fixture_class) {
    case "basin":
      if (name.includes("vessel")) return "vessel";
      if (tags.includes("wall_mount") || name.includes("wall-mount") || name.includes("wall-hung")) return "wall-hung";
      if (name.includes("undercounter") || name.includes("undermount")) return "undercounter";
      return null;
    case "toilet":
      if (tags.includes("wall_mount")) return "wall-hung";
      if (name.includes("one-piece")) return "one-piece";
      if (name.includes("two-piece")) return "two-piece";
      return null;
    case "faucet":
      if (name.includes("tall")) return "tall";
      if (name.includes("widespread")) return "widespread";
      return "single";
    case "tub":
      if (tags.includes("freestanding")) return "freestanding";
      if (name.includes("alcove")) return "alcove";
      if (name.includes("drop-in")) return "drop-in";
      return null;
    default:
      return null;
  }
}

/** A vessel bowl sits on the counter, so its rim is too high for a standard deck faucet:
 *  vessel basins take tall faucets and every other basin takes a standard one. */
export function faucetFitsBasin(basin: SKU, faucet: SKU): boolean {
  return (productType(basin) === "vessel") === (productType(faucet) === "tall");
}
