// Render geometry contract — what web/render2d (Canvas AABB projection) and web/render3d
// (procedural three.js) consume. `render = catalog geometry` (PRD §12, ADR-010): every
// placed fixture comes from the engine; the UI never invents or approximates shapes.

import type { RoomPolygon, Opening, AABB, ZoneKind } from "./geometry.js";
import type { FixtureClass } from "./vocab.js";

export interface PlacedFixtureRender {
  modelId: string;
  fixtureClass: FixtureClass;
  /** Original solver wall assignment; retained so 3D can disambiguate corner AABBs. */
  wallStripId?: string;
  zoneKind?: ZoneKind;
  aabb: AABB; // room coordinates, mm
  orientationDeg: number;
  finish?: string; // chosen finish (drives procedural 3D material)
}

/** 2D annotation derived from the fired-rule trace (dims, clearances) — SYS-ARCH §4. */
export interface RenderAnnotation {
  kind: "dimension" | "clearance" | "swing";
  at: { x: number; y: number };
  text: string;
}

export interface RenderGeometry {
  polygon: RoomPolygon;
  openings: Opening[];
  fixtures: PlacedFixtureRender[];
  annotations: RenderAnnotation[];
}
