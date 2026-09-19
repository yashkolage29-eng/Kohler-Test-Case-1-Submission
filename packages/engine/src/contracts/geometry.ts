// Geometry contracts — mirrors SYS-ARCH §5.1. Millimetres only, max 1 decimal place
// (SCHEMA §2.1). Pure types: no DOM, no I/O, no algorithms (algorithms land in T-005).

export interface Vec2 {
  x: number;
  y: number;
}

/** Authoritative room outline. Vertices normalized CCW from the lexicographically
 *  smallest vertex (see canonical.ts) before any solve. */
export interface RoomPolygon {
  vertices: Vec2[];
  ccw: boolean;
  wallThicknessMm: number;
}

/** A wall as a 1D linear strip: usable length after keep-clear subtraction (OPT §4). */
export interface WallStrip {
  id: string;
  wallSide: string;
  origin: Vec2;
  direction: Vec2;
  usableLengthMm: number;
}

export interface Opening {
  id: string;
  wallId: string;
  kind: "door" | "window";
  alongOffsetMm: number;
  spanMm: number;
  swing?: {
    side: "in" | "out";
    leafDimsMm: { w: number; d: number };
  };
}

/** Zone kinds per OPT §4 (toilet-zone, vanity-zone, shower-zone, tub-zone). */
export type ZoneKind = "toilet" | "vanity" | "shower" | "tub";

/** A zone is a span along a wall strip (SYS-ARCH §5.1 leaves Zone informal; this is the
 *  smallest concrete form consistent with the wall-strip model). */
export interface Zone {
  id: string;
  kind: ZoneKind;
  wallStripId: string;
  spanStartMm: number;
  spanEndMm: number;
}

/** Axis-aligned bounding box — the authoritative collision/render primitive (ADR-003). */
export interface AABB {
  min: Vec2;
  max: Vec2;
}

/** Fixed room feature that is not an opening (column, pipe box, …). */
export interface Obstacle {
  id: string;
  aabb: AABB;
  note?: string;
}

export interface BathroomRep {
  polygon: RoomPolygon;
  strips: WallStrip[];
  openings: Opening[];
  plumbingZones: Zone[];
  obstacles: Obstacle[];
  slotGridMm: number; // ≈25
}
