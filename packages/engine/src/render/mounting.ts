// T-027a mounting heights. Catalog primitives are authored from y = 0 (the product's own
// base), and RenderGeometry carries plan AABBs only, so the 3D renderer needs one
// deterministic rule for how high a product is installed. Standard residential heights;
// presentation only (no rule, BOM or clearance reads them).
import type { SKU } from "../catalog/schema.js";

/** Counter top height: undercounter/wall-hung basin rims, vessel bases and deck faucets. */
export const COUNTER_HEIGHT_MM = 850;
/** Wall-hung toilet rim height. */
export const WALL_TOILET_RIM_MM = 400;
/** Top of a wall-mounted shower head / column. */
export const SHOWER_TOP_MM = 2100;
/** Bottom of a thermostatic valve without a head. */
export const SHOWER_VALVE_BOTTOM_MM = 1000;
/** Centre of towel bars, rings and hooks. */
export const ACCESSORY_CENTRE_MM = 1100;
/** Centre of a toilet tissue holder. */
export const TISSUE_CENTRE_MM = 650;
/** Bottom of a mirrored cabinet (tall accessory). */
export const CABINET_BOTTOM_MM = 1150;

/** Height (mm) of the product's base above the floor; 0 for floor-standing products. */
export function mountElevationMm(sku: SKU): number {
  const h = sku.dim.h;
  const parts = sku.geometry_descriptor.primitives.map((p) => p.part);
  switch (sku.fixture_class) {
    case "basin":
      // Vessel bowls sit on the counter; undercounter and wall-hung bowls have their rim at it.
      return sku.name.toLowerCase().includes("vessel") ? COUNTER_HEIGHT_MM : COUNTER_HEIGHT_MM - h;
    case "faucet":
      return COUNTER_HEIGHT_MM;
    case "toilet":
      return sku.feature_tags.includes("wall_mount") ? Math.max(0, WALL_TOILET_RIM_MM - h) : 0;
    case "shower":
      return parts.includes("head") || h >= 600 ? Math.max(0, SHOWER_TOP_MM - h) : SHOWER_VALVE_BOTTOM_MM;
    case "accessory":
      if (sku.name.toLowerCase().includes("tissue")) return TISSUE_CENTRE_MM - h / 2;
      return h >= 400 ? CABINET_BOTTOM_MM : ACCESSORY_CENTRE_MM - h / 2;
    default:
      return 0;
  }
}
