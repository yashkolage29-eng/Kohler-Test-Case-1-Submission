// Per-rule config — OPT §5 "all rule values live in a single config file (one file per
// rule)": resolved as ONE module exporting one named entry per rule (satisfies both
// readings; recorded in ADR-022). The same entries drive validation (T-006/T-007) and
// narration. Values not present in the specs are marked planning-level pending audit.

import type { RuleId } from "../contracts/receipt.js";

export interface RuleConfig {
  id: RuleId;
  name: string;
  /** Human-readable explanation for narration (PRD §10.2). */
  explanation: string;
  values: Record<string, number>;
  /** Absolute minimum legal values — the floor the shrink-clearance relaxation may not
   *  go below (OPT §10.2.2). */
  minLegal?: Record<string, number>;
}

// C2 clearance values seeded from OPT §5 (WC front ~600, WC side ~450). PRD §10.2's
// "~24in front-of-toilet" (~610mm) reconciled to 600mm: OPT §5 is the operative engine
// spec and both are approximations — recorded in ADR-022.
export const C1_CONFIG: RuleConfig = {
  id: "C1",
  name: "Boundary/fit",
  explanation: "Fixture footprints sit fully inside the room; fixtures never overlap.",
  values: {},
};
export const C2_CONFIG: RuleConfig = {
  id: "C2",
  name: "Clearances",
  explanation: "Per-class minimum working/access clearance in front of and beside fixtures.",
  values: {
    toiletFrontMm: 600,
    toiletSideMm: 450,
    basinFrontMm: 600, // planning-level default — pending product audit
    vanityFrontMm: 600, // planning-level default — pending product audit
    showerEntryMm: 600, // planning-level default — pending product audit
    tubSideMm: 600, // planning-level default — pending product audit
  },
  minLegal: {
    toiletFrontMm: 530, // ≈21in — planning-level default — pending product audit
    toiletSideMm: 380, // planning-level default — pending product audit
    basinFrontMm: 530, // planning-level default — pending product audit
    vanityFrontMm: 530, // planning-level default — pending product audit
    showerEntryMm: 530, // planning-level default — pending product audit
    tubSideMm: 530, // planning-level default — pending product audit
  },
};
export const C3_CONFIG: RuleConfig = {
  id: "C3",
  name: "Door swing",
  explanation: "Door-swing arcs never collide with fixtures, walls, or other swings.",
  values: { collisionMarginMm: 25 }, // planning-level default — pending product audit
};
export const C4_CONFIG: RuleConfig = {
  id: "C4",
  name: "Zones",
  explanation: "Each fixture stays within its allotted zone span.",
  values: {},
};
export const C5_CONFIG: RuleConfig = {
  id: "C5",
  name: "Plumbing min",
  explanation: "Minimum distances between fixture connections, rough-ins, and openings.",
  values: {
    minRoughInSeparationMm: 300, // planning-level default — pending product audit
    maxPlumbingWallDistanceMm: 1200, // planning-level default — pending product audit
  },
};
export const C6_CONFIG: RuleConfig = {
  id: "C6",
  name: "Layout sanity",
  explanation: "A door cannot swing into a fixture clearance; related sanity checks.",
  values: {},
};
export const C7_CONFIG: RuleConfig = {
  id: "C7",
  name: "Compatibility",
  explanation:
    "Every pair of bound SKUs is compatible; SKUs match the feature constraints. Mounting (ADR-019): exactly one mounting tag per SKU is verified; wall_mount implies a carrier wall — a geometry/input authority, not a C7 check.",
  values: {},
};
export const C8_CONFIG: RuleConfig = {
  id: "C8",
  name: "Budget ceiling",
  explanation: "Total cost stays within the hard budget ceiling B_max.",
  values: {},
};

export const RULES: Record<RuleId, RuleConfig> = {
  C1: C1_CONFIG,
  C2: C2_CONFIG,
  C3: C3_CONFIG,
  C4: C4_CONFIG,
  C5: C5_CONFIG,
  C6: C6_CONFIG,
  C7: C7_CONFIG,
  C8: C8_CONFIG,
};
