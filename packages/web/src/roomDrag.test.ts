import { describe, expect, it } from "vitest";
import { buildWallStrips } from "@kolher/engine";
import { dragCandidate } from "./roomDrag.js";
import { buildRoomPreview, type RoomDraft, type RoomPreview } from "./store.js";

const RECT: RoomDraft = { shape: "rectangle", widthMm: "2400", depthMm: "1800", notchWidthMm: "900", notchDepthMm: "900", photoName: "" };
const L: RoomDraft = { ...RECT, shape: "l-shape", widthMm: "3000", depthMm: "2400" };

function preview(room: RoomDraft): RoomPreview {
  const built = buildRoomPreview(room);
  if (!built.ok) throw new Error(built.message);
  return built.preview;
}

describe("dragCandidate: walls", () => {
  it("dragging the right wall resizes width, snapped to 10 mm", () => {
    const c = dragCandidate(RECT, preview(RECT), { kind: "wall", edge: 1 }, { x: 2400, y: 900 }, { x: 2703, y: 950 });
    expect(c.error).toBeUndefined();
    expect(c.room.widthMm).toBe("2700");
    expect(c.room.depthMm).toBe("1800");
  });

  it("dragging the y=0 wall inward shrinks depth and keeps it valid", () => {
    const c = dragCandidate(RECT, preview(RECT), { kind: "wall", edge: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 300 });
    expect(c.room.depthMm).toBe("1500");
    expect(c.error).toBeUndefined();
  });

  it("dragging a wall past its opposite wall is rejected", () => {
    const c = dragCandidate(RECT, preview(RECT), { kind: "wall", edge: 1 }, { x: 2400, y: 900 }, { x: -100, y: 900 });
    expect(c.error).toBeDefined();
  });

  it("an opening that no longer fits its shrunk wall is rejected", () => {
    const p = preview(RECT);
    const door = p.openings[0];
    const doorWall = buildWallStrips(p.polygon).find((s) => s.id === door.wallId)!;
    // Move the wall perpendicular to the door wall so the door wall shrinks to 500 mm.
    const vertical = doorWall.direction.x === 0;
    const edge = vertical ? 0 : 1;
    const start = vertical ? { x: 0, y: 0 } : { x: 2400, y: 0 };
    const pointer = vertical ? { x: 0, y: 1800 - 500 } : { x: 500, y: 0 };
    const c = dragCandidate(RECT, p, { kind: "wall", edge }, start, pointer);
    expect(c.error).toMatch(/door-1/);
  });

  it("L-shape inner corner drag moves both cut fields", () => {
    const c = dragCandidate(L, preview(L), { kind: "corner" }, { x: 900, y: 900 }, { x: 1204, y: 1096 });
    expect(c.error).toBeUndefined();
    expect(c.room.notchWidthMm).toBe("1200");
    expect(c.room.notchDepthMm).toBe("1100");
    expect(c.room.widthMm).toBe("3000");
  });

  it("a pre-existing opening error does not block an unrelated corner drag", () => {
    const p = preview(L);
    const broken: RoomPreview = { ...p, openings: [{ ...p.openings[0], alongOffsetMm: 99999 }] };
    const c = dragCandidate(L, broken, { kind: "corner" }, { x: 900, y: 900 }, { x: 1000, y: 900 });
    expect(c.error).toBeUndefined();
    expect(c.room.notchWidthMm).toBe("1000");
  });

  it("L-shape inner vertical wall drag changes only cut width", () => {
    const c = dragCandidate(L, preview(L), { kind: "wall", edge: 3 }, { x: 900, y: 1500 }, { x: 1000, y: 1500 });
    expect(c.room.notchWidthMm).toBe("1000");
    expect(c.room.notchDepthMm).toBe("900");
  });
});

describe("dragCandidate: openings", () => {
  it("slides a door along its wall, clamped inside the wall", () => {
    const p = preview(RECT);
    const door = p.openings[0];
    const wall = buildWallStrips(p.polygon).find((s) => s.id === door.wallId)!;
    const far = { x: wall.origin.x + wall.direction.x * 99999, y: wall.origin.y + wall.direction.y * 99999 };
    const c = dragCandidate(RECT, p, { kind: "opening", id: door.id }, far, far);
    const moved = c.openings.find((o) => o.id === door.id)!;
    expect(moved.wallId).toBe(wall.id);
    expect(moved.alongOffsetMm).toBe(wall.usableLengthMm - door.spanMm);
    expect(c.error).toBeUndefined();
  });

  it("moves a door onto the nearest other wall", () => {
    const p = preview(RECT);
    const door = p.openings[0];
    const target = buildWallStrips(p.polygon).find((s) => s.id !== door.wallId && s.usableLengthMm >= door.spanMm)!;
    const mid = { x: target.origin.x + target.direction.x * target.usableLengthMm / 2, y: target.origin.y + target.direction.y * target.usableLengthMm / 2 };
    const c = dragCandidate(RECT, p, { kind: "opening", id: door.id }, mid, mid);
    const moved = c.openings.find((o) => o.id === door.id)!;
    expect(moved.wallId).toBe(target.id);
    expect(moved.alongOffsetMm % 10).toBe(0);
    expect(c.error).toBeUndefined();
  });

  it("flags overlap with another opening on the same wall", () => {
    const p = preview(RECT);
    const door = p.openings[0];
    const withWindow: RoomPreview = { ...p, openings: [...p.openings, { id: "window-1", kind: "window", wallId: door.wallId, alongOffsetMm: 0, spanMm: 600 }] };
    const wall = buildWallStrips(p.polygon).find((s) => s.id === door.wallId)!;
    const onWindow = { x: wall.origin.x + wall.direction.x * 300, y: wall.origin.y + wall.direction.y * 300 };
    const c = dragCandidate(RECT, withWindow, { kind: "opening", id: door.id }, onWindow, onWindow);
    expect(c.error).toMatch(/overlaps/);
  });
});
