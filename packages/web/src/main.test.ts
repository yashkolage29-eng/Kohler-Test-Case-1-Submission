import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildWallStrips } from "@kolher/engine";
import { buildRoomPreview, initialState, reduceState, type AppState } from "./store.js";

let roomScreen: typeof import("./main.js")["roomScreen"];

beforeAll(async () => {
  vi.stubGlobal("document", { querySelector: () => null });
  ({ roomScreen } = await import("./main.js"));
});

afterAll(() => vi.unstubAllGlobals());

function previewState(): AppState {
  const state = initialState();
  const result = buildRoomPreview(state.room);
  if (!result.ok) throw new Error(result.message);
  return reduceState(state, { type: "PREVIEW_ROOM_SUCCESS", preview: result.preview });
}

describe("direct room preview UI", () => {
  it("renders keyboard-selectable walls and every opening with stable focus keys", () => {
    let state = reduceState(previewState(), { type: "EDIT_ROOM" });
    state = reduceState(state, { type: "ADD_WINDOW" });
    const html = roomScreen(state);
    for (const wall of buildWallStrips(state.preview!.polygon)) {
      expect(html).toContain(`data-focus-key="wall-${wall.id}" role="button" tabindex="0"`);
    }
    for (const opening of state.preview!.openings) {
      expect(html).toContain(`data-focus-key="opening-${opening.id}" role="button" tabindex="0"`);
      expect(html).toContain(`class="preview-${opening.kind}"`);
    }
    expect(html).toContain('aria-label="window window-1: 600 mm. Drag along or onto another wall, or select to edit" aria-pressed="true"');
    expect(html).toContain('data-form="opening"');
    expect(html).toContain('name="wallId"');
    expect(html).toContain('name="alongOffsetMm"');
    expect(html).toContain('name="spanMm"');
  });

  it("shows editing controls only after Edit and exposes the existing L-shape fields", () => {
    let state = previewState();
    expect(roomScreen(state)).not.toContain('aria-label="Room editor"');
    state = reduceState(state, { type: "EDIT_ROOM" });
    state = reduceState(state, { type: "SET_ROOM_SHAPE", shape: "l-shape" });
    const html = roomScreen(state);
    expect(html).toContain('aria-label="Room editor"');
    for (const action of ["add-window", "undo-room", "cancel-room", "confirm-room", "focus-room-dimensions"]) {
      expect(html).toContain(`data-action="${action}"`);
    }
    for (const field of ["widthMm", "depthMm", "notchWidthMm", "notchDepthMm"]) {
      expect(html.match(new RegExp(`data-room-field="${field}"`, "g"))).toHaveLength(1);
    }
    expect(html).toContain("Escape cancels");
    expect(html).not.toContain('data-form="opening"');
  });

  it("offers removal only for windows and displays failed opening validation", () => {
    let state = reduceState(previewState(), { type: "EDIT_ROOM" });
    state = reduceState(state, { type: "SELECT_ROOM_ELEMENT", selection: { kind: "opening", id: "door-1" } });
    expect(roomScreen(state)).not.toContain('data-action="remove-window"');
    state = reduceState(state, { type: "ADD_WINDOW" });
    expect(roomScreen(state)).toContain('data-action="remove-window"');
    state = reduceState(state, { type: "UPDATE_OPENING", id: "window-1", wallId: "wall-right", alongOffsetMm: 2000, spanMm: 600 });
    expect(roomScreen(state)).toContain("window-1 does not fit its wall");
    expect(roomScreen(state)).toContain('role="alert"');
  });
});
