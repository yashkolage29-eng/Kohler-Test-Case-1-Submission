// Page-1 preview drag editing (pure, no DOM). Pointer positions arrive in the room frame
// captured at drag start; every candidate is re-validated by buildRoomPreview + openingError,
// so dragging can never produce geometry the typed fields could not.

import { buildWallStrips, stripPoint, type InputSet, type Vec2 } from "@kolher/engine";
import { buildRoomPreview, openingError, type RoomDraft, type RoomPreview } from "./store.js";

export const DRAG_SNAP_MM = 10;

export type DragTarget =
  | { kind: "wall"; edge: number }
  | { kind: "opening"; id: string }
  | { kind: "corner" };

export interface DragCandidate {
  /** Vertices in the drag-start frame (for a stable live drawing). */
  vertices: Vec2[];
  openings: InputSet["openings"];
  room: RoomDraft;
  /** Undefined when the candidate is valid. */
  error?: string;
  label: string;
}

const snap = (mm: number): number => Math.round(mm / DRAG_SNAP_MM) * DRAG_SNAP_MM;

/** Rectangle: [W, D] from v1.x, v2.y. L-shape adds the inner corner v3.x, v4.y (see buildRoomPreview). */
function roomFromVertices(room: RoomDraft, vertices: Vec2[]): RoomDraft {
  const o = vertices[0];
  const rel = vertices.map((v) => ({ x: v.x - o.x, y: v.y - o.y }));
  const next = { ...room, widthMm: String(rel[1].x), depthMm: String(rel[2].y) };
  return room.shape === "l-shape" ? { ...next, notchWidthMm: String(rel[3].x), notchDepthMm: String(rel[4].y) } : next;
}

function finish(room: RoomDraft, before: RoomPreview, vertices: Vec2[], openings: InputSet["openings"], label: string): DragCandidate {
  const nextRoom = roomFromVertices(room, vertices);
  const built = buildRoomPreview(nextRoom, openings);
  const error = !built.ok ? built.message : openingError(built.preview);
  // Only errors the drag introduces block it; a pre-existing opening error stays visible
  // in roomError and must not freeze every other edit.
  return { vertices, openings, room: nextRoom, error: error === openingError(before) ? undefined : error, label };
}

/**
 * Candidate for a drag. `start` and `pointer` are room-frame mm (y as in the polygon);
 * the delta is snapped so the dragged element keeps its offset from the pointer.
 */
export function dragCandidate(room: RoomDraft, preview: RoomPreview, target: DragTarget, start: Vec2, pointer: Vec2): DragCandidate {
  const vertices = preview.polygon.vertices;
  const dx = snap(pointer.x - start.x);
  const dy = snap(pointer.y - start.y);

  if (target.kind === "wall") {
    const n = vertices.length;
    const a = vertices[target.edge];
    const b = vertices[(target.edge + 1) % n];
    const vertical = a.x === b.x;
    const moved = vertices.map((v, i) => (i === target.edge || i === (target.edge + 1) % n)
      ? (vertical ? { x: v.x + dx, y: v.y } : { x: v.x, y: v.y + dy })
      : v);
    const c = finish(room, preview, moved, preview.openings, "");
    return { ...c, label: `${c.room.widthMm} × ${c.room.depthMm} mm` };
  }

  if (target.kind === "corner") {
    // L-shape inner corner: vertices 3 and 4 share it; 3 keeps y = depth, 5 keeps x = 0.
    const moved = vertices.map((v, i) => i === 3 ? { x: v.x + dx, y: v.y }
      : i === 4 ? { x: v.x + dx, y: v.y + dy }
        : i === 5 ? { x: v.x, y: v.y + dy } : v);
    const c = finish(room, preview, moved, preview.openings, "");
    return { ...c, label: `cut ${c.room.notchWidthMm} × ${c.room.notchDepthMm} mm` };
  }

  const opening = preview.openings.find((item) => item.id === target.id);
  if (!opening) return { ...finish(room, preview, [...vertices], preview.openings, ""), error: "Opening not found." };
  // Nearest wall to the pointer; the opening centres on the pointer projection.
  const nearest = buildWallStrips(preview.polygon)
    .filter((strip) => strip.usableLengthMm >= opening.spanMm)
    .map((strip) => {
      const along = (pointer.x - strip.origin.x) * strip.direction.x + (pointer.y - strip.origin.y) * strip.direction.y;
      const clamped = Math.max(0, Math.min(strip.usableLengthMm, along));
      const p = stripPoint(strip, clamped);
      return { strip, along, distance: Math.hypot(pointer.x - p.x, pointer.y - p.y) };
    })
    .sort((p, q) => p.distance - q.distance || (p.strip.id < q.strip.id ? -1 : 1))[0];
  if (!nearest) return { ...finish(room, preview, [...vertices], preview.openings, ""), error: `No wall fits ${opening.id}.` };
  const offset = Math.max(0, Math.min(nearest.strip.usableLengthMm - opening.spanMm, snap(nearest.along - opening.spanMm / 2)));
  const openings = preview.openings.map((item) => item.id === opening.id ? { ...item, wallId: nearest.strip.id, alongOffsetMm: offset } : item);
  return finish(room, preview, [...vertices], openings, `${opening.id} · ${nearest.strip.id} · ${offset} mm`);
}
