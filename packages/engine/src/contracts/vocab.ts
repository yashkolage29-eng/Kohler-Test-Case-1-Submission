// Closed vocabularies — single source of truth, owned by contracts (ADR-022).
// Mirrors SCHEMA §3; the catalog module (T-003) imports these, never redefines them.

export type FixtureClass =
  | "toilet"
  | "basin"
  | "faucet"
  | "shower"
  | "tub"
  | "vanity"
  | "accessory";

export const FIXTURE_CLASSES: readonly FixtureClass[] = [
  "toilet",
  "basin",
  "faucet",
  "shower",
  "tub",
  "vanity",
  "accessory",
];

export type FinishFamily =
  | "white"
  | "chrome"
  | "brushed_nickel"
  | "matte_black"
  | "brushed_gold"
  | "stone";

export const FINISH_FAMILIES: readonly FinishFamily[] = [
  "white",
  "chrome",
  "brushed_nickel",
  "matte_black",
  "brushed_gold",
  "stone",
];

/** Mounting is exactly-one-per-SKU (SCHEMA §3.3, ADR-019); enforced by catalog validation. */
export type MountingTag = "floor_mount" | "wall_mount" | "deck_mount" | "freestanding";

export const MOUNTING_TAGS: readonly MountingTag[] = [
  "floor_mount",
  "wall_mount",
  "deck_mount",
  "freestanding",
];

/** SCHEMA §3.3 closed set (18 values = 14 feature tags + 4 mounting tags). */
export type FeatureTag =
  | "smart"
  | "bidet"
  | "heated_seat"
  | "self_cleaning"
  | "dual_flush"
  | "low_flow"
  | "rain_shower"
  | "thermostatic"
  | "touchless"
  | "single_lever"
  | "comfort_height"
  | "elongated"
  | "overflow_none"
  | "soft_close"
  | MountingTag;

export const FEATURE_TAGS: readonly FeatureTag[] = [
  "smart",
  "bidet",
  "heated_seat",
  "self_cleaning",
  "dual_flush",
  "low_flow",
  "rain_shower",
  "thermostatic",
  "touchless",
  "single_lever",
  "comfort_height",
  "elongated",
  "overflow_none",
  "soft_close",
  ...MOUNTING_TAGS,
];

/** Steering knobs (OPT §2.4). Priority spelling resolved to "balanced" per OPT §6.1
 *  (the operative weight table) over §2.4's "balance" — recorded in ADR-022. */
export type Priority = "value" | "balanced" | "luxury" | "eco-low-maintenance";

export const PRIORITIES: readonly Priority[] = [
  "value",
  "balanced",
  "luxury",
  "eco-low-maintenance",
];

export type Spaciousness = "compact" | "balanced" | "airy";

export const SPACIOUSNESS_LEVELS: readonly Spaciousness[] = [
  "compact",
  "balanced",
  "airy",
];
