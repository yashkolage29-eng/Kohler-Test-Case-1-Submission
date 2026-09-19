import type { Opening, RoomPolygon } from "./contracts/geometry.js";
import { normalizeRoomPolygon } from "./geometry/polygon.js";
import { buildWallStrips } from "./geometry/strips.js";
import { validateOpenings } from "./geometry/openings.js";

export type DimensionField = "widthMm" | "depthMm" | "notchWidthMm" | "notchDepthMm";
export type RoomOperation =
  | { op: "dimension"; field: DimensionField; value: number }
  | { op: "opening"; id: string; kind: "door" | "window"; wallId: string; alongOffsetMm: number; spanMm: number; swing: "in" | "out" }
  | { op: "remove-opening"; id: string };
export interface RoomProposal { operations: RoomOperation[] }
export interface DraftRoom { polygon: RoomPolygon; openings: Opening[]; confirmed: boolean }

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function number(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}
function member(value: unknown, allowed: string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}
function id(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,60}$/.test(value);
}

export function parseRoomProposal(raw: unknown): RoomProposal | null {
  if (!object(raw) || !keys(raw, ["operations"]) || !Array.isArray(raw.operations) || raw.operations.length < 1 || raw.operations.length > 20) return null;
  for (const op of raw.operations) {
    if (!object(op)) return null;
    if (op.op === "dimension") {
      if (!keys(op, ["op", "field", "value"]) || !member(op.field, ["widthMm", "depthMm", "notchWidthMm", "notchDepthMm"]) || !number(op.value, 1, 20000)) return null;
    } else if (op.op === "opening") {
      if (!keys(op, ["op", "id", "kind", "wallId", "alongOffsetMm", "spanMm", "swing"]) || !id(op.id) || !id(op.wallId) || !member(op.kind, ["door", "window"]) || !member(op.swing, ["in", "out"]) || !number(op.alongOffsetMm, 0, 20000) || !number(op.spanMm, 1, 20000)) return null;
    } else if (op.op !== "remove-opening" || !keys(op, ["op", "id"]) || !id(op.id)) return null;
  }
  return JSON.parse(JSON.stringify(raw)) as unknown as RoomProposal;
}

export function parseDraftRoom(raw: unknown): DraftRoom | null {
  if (!object(raw) || !keys(raw, ["polygon", "openings", "confirmed"]) || typeof raw.confirmed !== "boolean" || !object(raw.polygon) || !keys(raw.polygon, ["vertices", "ccw", "wallThicknessMm"]) || raw.polygon.ccw !== true || !number(raw.polygon.wallThicknessMm, 1, 1000) || !Array.isArray(raw.polygon.vertices) || ![4, 6].includes(raw.polygon.vertices.length) || !raw.polygon.vertices.every((p) => object(p) && keys(p, ["x", "y"]) && number(p.x, 0, 20000) && number(p.y, 0, 20000)) || !Array.isArray(raw.openings) || raw.openings.length > 20) return null;
  const polygon = raw.polygon as unknown as RoomPolygon;
  if (!normalizeRoomPolygon(polygon).ok) return null;
  const ids = new Set<string>();
  for (const o of raw.openings) {
    if (!object(o) || !keys(o, ["id", "wallId", "kind", "alongOffsetMm", "spanMm", "swing"]) || !id(o.id) || ids.has(o.id) || !id(o.wallId) || !["door", "window"].includes(String(o.kind)) || !number(o.alongOffsetMm, 0, 20000) || !number(o.spanMm, 1, 20000)) return null;
    if (o.swing !== undefined && (!object(o.swing) || !keys(o.swing, ["side", "leafDimsMm"]) || !["in", "out"].includes(String(o.swing.side)) || !object(o.swing.leafDimsMm) || !keys(o.swing.leafDimsMm, ["w", "d"]) || !number(o.swing.leafDimsMm.w, 1, 20000) || !number(o.swing.leafDimsMm.d, 1, 1000))) return null;
    ids.add(o.id);
  }
  if (!validateOpenings(raw.openings as Opening[], buildWallStrips(polygon)).ok) return null;
  return JSON.parse(JSON.stringify(raw)) as unknown as DraftRoom;
}
