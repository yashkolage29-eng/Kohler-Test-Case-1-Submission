import type { AppState } from "./store.js";
import { describe, expect, it } from "vitest";
import { buildRenderGeometry, buildWallStrips, loadCatalog } from "@kolher/engine";
import {
  buildConfirmedInput,
  buildRoomPreview,
  EMPTY_FEATURE_CONSTRAINTS,
  initialState,
  offlineTasteToFeatures,
  priorityTabs,
  openingError,
  selectedPlan,
  reduceState,
  reoptimizeConfirmed,
  solveConfirmed,
} from "./store.js";

describe("room preview editor", () => {
  function editingRoom() {
    const result = buildRoomPreview(initialState().room);
    if (!result.ok) throw new Error(result.message);
    return reduceState(reduceState(initialState(), { type: "PREVIEW_ROOM_SUCCESS", preview: result.preview }), { type: "EDIT_ROOM" });
  }

  it("selects existing walls and openings without losing state or adding history", () => {
    let state = editingRoom();
    state = reduceState(state, { type: "SELECT_ROOM_ELEMENT", selection: { kind: "opening", id: "door-1" } });
    expect(state.roomSelection).toEqual({ kind: "opening", id: "door-1" });
    expect(state.roomEditor?.history).toHaveLength(0);
    expect(reduceState(state, { type: "SELECT_ROOM_ELEMENT", selection: { kind: "wall", id: "missing" } })).toBe(state);
    expect(reduceState(state, { type: "EDIT_ROOM" })).toBe(state);
    expect(reduceState(initialState(), { type: "SELECT_ROOM_ELEMENT", selection: { kind: "opening", id: "door-1" } })).toEqual(initialState());
  });

  it("adds, selects, removes and undoes a window without removing the door", () => {
    let state = reduceState(editingRoom(), { type: "ADD_WINDOW" });
    expect(state.roomSelection).toEqual({ kind: "opening", id: "window-1" });
    const added = state;
    expect(state.preview?.openings).toHaveLength(2);
    expect(reduceState(state, { type: "REMOVE_WINDOW", id: "door-1" })).toBe(state);
    state = reduceState(state, { type: "REMOVE_WINDOW", id: "window-1" });
    expect(state.preview?.openings).toHaveLength(1);
    expect(state.roomSelection?.kind).toBe("wall");
    state = reduceState(state, { type: "UNDO_ROOM_EDIT" });
    expect(state.preview).toEqual(added.preview);
    expect(state.roomSelection).toEqual(added.roomSelection);
  });

  it("adds many windows in a big room, several per wall, never overlapping (T-037)", () => {
    const room = { ...initialState().room, widthMm: "5000", depthMm: "4000" };
    const result = buildRoomPreview(room);
    if (!result.ok) throw new Error(result.message);
    let state = reduceState(reduceState({ ...initialState(), room }, { type: "PREVIEW_ROOM_SUCCESS", preview: result.preview }), { type: "EDIT_ROOM" });
    for (let i = 0; i < 8; i++) state = reduceState(state, { type: "ADD_WINDOW" });
    const windows = state.preview!.openings.filter((o) => o.kind === "window");
    expect(windows).toHaveLength(8);
    expect(state.roomError).toBeUndefined();
    const perWall = new Map<string, number>();
    for (const w of windows) perWall.set(w.wallId, (perWall.get(w.wallId) ?? 0) + 1);
    expect(Math.max(...perWall.values())).toBeGreaterThanOrEqual(2);
    // No overlaps and every window inside its wall (openingError is the room validator).
    expect(openingError(state.preview!)).toBeUndefined();
  });

  it("refuses a window only when no wall has a free 600 mm gap (T-037)", () => {
    let state = editingRoom(); // 2400 × 1800
    for (let i = 0; i < 20; i++) state = reduceState(state, { type: "ADD_WINDOW" });
    expect(state.roomError).toContain("600 mm");
    expect(openingError(state.preview!)).toBeUndefined();
    expect(state.preview!.openings.filter((o) => o.kind === "window").length).toBeGreaterThan(3);
  });

  it("preserves edited openings across preview refresh and temporarily invalid dimensions", () => {
    let state = reduceState(editingRoom(), { type: "ADD_WINDOW" });
    state = reduceState(state, { type: "UPDATE_OPENING", id: "door-1", wallId: "wall-right", alongOffsetMm: 100, spanMm: 800 });
    const openings = state.preview!.openings;
    state = reduceState(state, { type: "SET_ROOM_FIELD", field: "widthMm", value: "" });
    expect(state.roomError).toBeDefined();
    expect(state.preview?.openings).toEqual(openings);
    expect(reduceState(state, { type: "CONFIRM_ROOM" }).preview?.confirmed).toBe(false);
    state = reduceState(state, { type: "PREVIEW_ROOM_ERROR", message: "Invalid width" });
    state = reduceState(state, { type: "SET_ROOM_FIELD", field: "widthMm", value: "2600" });
    const refreshed = buildRoomPreview(state.room, state.preview?.openings);
    if (!refreshed.ok) throw new Error(refreshed.message);
    state = reduceState(state, { type: "PREVIEW_ROOM_SUCCESS", preview: refreshed.preview });
    expect(state.preview?.openings).toEqual(openings);
    expect(state.preview?.openings[0].swing?.leafDimsMm.w).toBe(800);
  });

  it("retains authored offsets and windows through sequential dimension typing", () => {
    let state = reduceState(editingRoom(), { type: "ADD_WINDOW" });
    state = reduceState(state, { type: "UPDATE_OPENING", id: "window-1", wallId: "wall-right", alongOffsetMm: 900, spanMm: 600 });
    const openings = state.preview!.openings;
    expect(openings[0].alongOffsetMm).toBe(1550);
    for (const value of ["", "2", "26", "260"]) {
      state = reduceState(state, { type: "SET_ROOM_FIELD", field: "widthMm", value });
      expect(state.preview?.openings).toEqual(openings);
      expect(state.adjustments.doorOffsetMm).toBe("1550");
      expect(state.roomError).toBeDefined();
      if (value) expect(state.roomError).toContain("does not fit");
      state = reduceState(state, { type: "CONFIRM_ROOM" });
      expect(state.screen).toBe("room");
      expect(state.preview?.confirmed).toBe(false);
      expect(buildConfirmedInput(state).ok).toBe(false);
    }
    state = reduceState(state, { type: "SET_ROOM_FIELD", field: "widthMm", value: "2600" });
    expect(state.roomError).toBeUndefined();
    expect(state.preview?.openings).toEqual(openings);
    expect(state.adjustments.doorOffsetMm).toBe("1550");
    const input = buildConfirmedInput(reduceState(state, { type: "CONFIRM_ROOM" }));
    expect(input.ok).toBe(true);
    if (input.ok) expect(input.input.openings).toEqual(openings);
  });

  it("retains openings when the preview is temporarily unavailable", () => {
    let state = reduceState(editingRoom(), { type: "ADD_WINDOW" });
    const openings = state.preview!.openings;
    state = { ...state, preview: undefined };
    state = reduceState(state, { type: "SET_ROOM_FIELD", field: "widthMm", value: "" });
    expect(state.preview).toBeUndefined();
    state = reduceState(state, { type: "SET_ROOM_FIELD", field: "widthMm", value: "2600" });
    expect(state.preview?.openings).toEqual(openings);
    // Shape switch keeps the door at the same physical spot, on the L's matching wall.
    state = reduceState({ ...state, preview: undefined }, { type: "SET_ROOM_SHAPE", shape: "l-shape" });
    const door = openings.find((o) => o.id === "door-1")!;
    expect(state.preview?.openings.find((o) => o.id === "door-1")).toEqual({ ...door, wallId: "wall-bottom-2", alongOffsetMm: door.alongOffsetMm - 900 });
    expect(state.roomError).toBeUndefined();
  });

  it("re-homes openings when switching rectangle ↔ L-shape (door stays put)", () => {
    let state = reduceState(editingRoom(), { type: "ADD_WINDOW" });
    const before = state.preview!.openings;
    state = reduceState(state, { type: "SET_ROOM_SHAPE", shape: "l-shape" });
    expect(state.roomError).toBeUndefined();
    const walls = buildWallStrips(state.preview!.polygon);
    for (const opening of state.preview!.openings) {
      const wall = walls.find((w) => w.id === opening.wallId)!;
      expect(opening.alongOffsetMm + opening.spanMm).toBeLessThanOrEqual(wall.usableLengthMm);
    }
    // Back to the rectangle restores the original placements.
    state = reduceState(state, { type: "SET_ROOM_SHAPE", shape: "rectangle" });
    expect(state.roomError).toBeUndefined();
    expect(state.preview!.openings.find((o) => o.id === "door-1")).toEqual(before.find((o) => o.id === "door-1"));
    expect(reduceState(state, { type: "CONFIRM_ROOM" }).preview?.confirmed).toBe(true);
  });

  it("surfaces opening errors on explicit preview refresh without moving openings", () => {
    const state = editingRoom();
    const openings = state.preview!.openings;
    const room = { ...state.room, widthMm: "200", depthMm: "200" };
    const result = buildRoomPreview(room, openings);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.preview.openings).toEqual(openings);
    const refreshed = reduceState({ ...state, room }, { type: "PREVIEW_ROOM_SUCCESS", preview: result.preview });
    expect(refreshed.roomError).toContain("does not fit");
    expect(reduceState(refreshed, { type: "CONFIRM_ROOM" }).preview?.confirmed).toBe(false);
  });

  it("blocks overlapping and out-of-wall openings until repaired", () => {
    let state = reduceState(editingRoom(), { type: "ADD_WINDOW" });
    const door = state.preview!.openings[0];
    state = reduceState(state, { type: "UPDATE_OPENING", id: "window-1", wallId: door.wallId, alongOffsetMm: door.alongOffsetMm, spanMm: 600 });
    expect(state.roomError).toContain("overlaps");
    expect(reduceState(state, { type: "CONFIRM_ROOM" }).screen).toBe("room");
    state = reduceState(state, { type: "UPDATE_OPENING", id: "window-1", wallId: "wall-right", alongOffsetMm: 1700, spanMm: 600 });
    expect(state.roomError).toContain("does not fit");
    state = reduceState(state, { type: "UPDATE_OPENING", id: "window-1", wallId: "wall-right", alongOffsetMm: 100, spanMm: 600 });
    expect(state.roomError).toBeUndefined();
    const confirmed = reduceState(state, { type: "CONFIRM_ROOM" });
    expect(confirmed.roomEditor).toBeUndefined();
    expect(buildConfirmedInput(confirmed).ok).toBe(true);
  });

  it("restores confirmed geometry, selection and result state on cancel", () => {
    const base = reduceState(editingRoom(), { type: "CONFIRM_ROOM" });
    const original = { ...base, screen: "result" as const, solveStatus: "success" as const, adjustmentsDirty: true };
    let state = reduceState(original, { type: "EDIT_ROOM" });
    state = reduceState(state, { type: "SET_ROOM_SHAPE", shape: "l-shape" });
    state = reduceState(state, { type: "ADD_WINDOW" });
    expect(reduceState(state, { type: "CANCEL_ROOM_EDIT" })).toEqual(original);
  });

  it("opens editing, changes a door, undoes, cancels, and confirms the edited opening", () => {
    const result = buildRoomPreview(initialState().room);
    if (!result.ok) throw new Error(result.message);
    const original = reduceState(initialState(), { type: "PREVIEW_ROOM_SUCCESS", preview: result.preview });
    let state = reduceState(original, { type: "EDIT_ROOM" });
    expect(state.roomEditor).toBeDefined();
    const edit = { type: "UPDATE_OPENING" as const, id: "door-1", wallId: "wall-right", alongOffsetMm: 100, spanMm: 800 };
    state = reduceState(state, edit);
    expect(state.preview?.openings[0]).toMatchObject({ wallId: "wall-right", alongOffsetMm: 100, spanMm: 800 });
    state = reduceState(state, { type: "UNDO_ROOM_EDIT" });
    expect(state.preview).toEqual(original.preview);
    state = reduceState(state, edit);
    expect(reduceState(state, { type: "CANCEL_ROOM_EDIT" })).toEqual(original);
    state = reduceState(state, { type: "CONFIRM_ROOM" });
    const input = buildConfirmedInput(state);
    expect(input.ok).toBe(true);
    if (input.ok) expect(input.input.openings[0]).toMatchObject({ wallId: "wall-right", alongOffsetMm: 100, spanMm: 800 });
  });
});

describe("T-016 room gate", () => {
  it("builds a deterministic rectangle with a default door opening", () => {
    const state = initialState();
    const first = buildRoomPreview(state.room);
    const second = buildRoomPreview(state.room);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.preview.polygon.vertices).toHaveLength(4);
      expect(first.preview.openings[0]?.wallId).toBe("wall-bottom");
      expect(first.preview.confirmed).toBe(false);
    }
  });

  it("places the default door on a wall that actually fits (L-shape wall-id trap)", () => {
    const state = initialState();
    const result = buildRoomPreview({ ...state.room, shape: "l-shape" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const door = result.preview.openings[0]!;
      const strips = buildWallStrips(result.preview.polygon);
      const wall = strips.find((strip) => strip.id === door.wallId);
      expect(wall, `door wall ${door.wallId} exists`).toBeDefined();
      expect(wall!.usableLengthMm).toBeGreaterThanOrEqual(door.spanMm);
      expect(door.alongOffsetMm + door.spanMm).toBeLessThanOrEqual(wall!.usableLengthMm);
    }
  });

  it("rejects malformed L-shape dimensions before a solver call", () => {
    const state = initialState();
    const result = buildRoomPreview({ ...state.room, shape: "l-shape", notchWidthMm: "2400" });
    expect(result).toEqual({ ok: false, message: "The L-shape cut must be smaller than both room dimensions." });
  });

  it("refreshes geometry without clamping an authored door offset", () => {
    let state = initialState();
    const preview = buildRoomPreview(state.room);
    if (!preview.ok) throw new Error("preview failed");
    state = reduceState(state, { type: "PREVIEW_ROOM_SUCCESS", preview: preview.preview });
    expect(state.adjustments.doorOffsetMm).not.toBe("");
    state = reduceState(state, { type: "SET_ROOM_FIELD", field: "widthMm", value: "1500" });
    expect(state.preview?.confirmed).toBe(false);
    expect(state.adjustments.doorOffsetMm).toBe("1550");
    expect(state.preview?.polygon.vertices[1].x).toBe(1500);
    expect(state.roomError).toContain("does not fit");
    expect(reduceState(state, { type: "CONFIRM_ROOM" }).screen).toBe("room");
    const door = state.preview?.openings[0];
    expect(door && String(door.alongOffsetMm)).toBe(state.adjustments.doorOffsetMm);
  });

  it("clamps a stale door offset into the confirmed wall instead of failing the brief", () => {
    let state = initialState();
    state = { ...state, room: { ...state.room, widthMm: "1500" } };
    const preview = buildRoomPreview(state.room);
    if (!preview.ok) throw new Error("preview failed");
    state = reduceState(state, { type: "PREVIEW_ROOM_SUCCESS", preview: preview.preview });
    state = reduceState(state, { type: "CONFIRM_ROOM" });
    // Simulate the stale-offset bug: the door offset carried over from a larger
    // (2400 mm) room while the confirmed wall is only 1500 mm long.
    state = { ...state, adjustments: { ...state.adjustments, doorOffsetMm: "1550" } };
    const input = buildConfirmedInput(state);
    expect(input.ok).toBe(true);
    if (input.ok) {
      const door = input.input.openings.find((opening) => opening.kind === "door");
      const wall = buildWallStrips(state.preview!.polygon).find((strip) => strip.id === door?.wallId);
      expect(wall).toBeDefined();
      expect(door!.alongOffsetMm + door!.spanMm).toBeLessThanOrEqual(wall!.usableLengthMm);
    }
  });

  it("applies the door slider to the single door only, leaving a second door and every window untouched", () => {
    const result = buildRoomPreview(initialState().room);
    if (!result.ok) throw new Error(result.message);
    let state = reduceState(reduceState(initialState(), { type: "PREVIEW_ROOM_SUCCESS", preview: result.preview }), { type: "EDIT_ROOM" });
    state = reduceState(state, { type: "ADD_WINDOW" });
    const windowBefore = state.preview!.openings.find((opening) => opening.kind === "window")!;
    const secondDoor = { id: "door-2", kind: "door" as const, wallId: "wall-right", alongOffsetMm: 300, spanMm: 700, swing: { side: "in" as const, leafDimsMm: { w: 700, d: 25 } } };
    state = { ...state, preview: { ...state.preview!, openings: [...state.preview!.openings, secondDoor] } };
    state = reduceState(state, { type: "CONFIRM_ROOM" });
    expect(state.preview?.confirmed).toBe(true);
    state = reduceState(state, { type: "SET_DOOR_OFFSET", value: "75" });
    const input = buildConfirmedInput(state);
    expect(input.ok).toBe(true);
    if (!input.ok) return;
    const doors = input.input.openings.filter((opening) => opening.kind === "door");
    expect(doors).toHaveLength(2);
    const sliderDoor = doors.find((opening) => opening.id === "door-1")!;
    const otherDoor = doors.find((opening) => opening.id === "door-2")!;
    expect(sliderDoor.alongOffsetMm).toBe(75);
    expect(otherDoor.alongOffsetMm).toBe(300);
    expect(input.input.openings.find((opening) => opening.id === windowBefore.id)).toEqual(windowBefore);
  });

  it("keeps the solver behind explicit confirmation", () => {
    const state = initialState();
    expect(buildConfirmedInput(state)).toEqual({ ok: false, message: "Confirm the room preview before generating a plan." });
    expect(solveConfirmed(state, loadCatalog().state)).toEqual({ ok: false, message: "Confirm the room preview before generating a plan." });
  });

  it("moves from preview to taste only after confirmation", () => {
    const preview = buildRoomPreview(initialState().room);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const withPreview = reduceState(initialState(), { type: "PREVIEW_ROOM_SUCCESS", preview: preview.preview });
    expect(withPreview.screen).toBe("room");
    const confirmed = reduceState(withPreview, { type: "CONFIRM_ROOM" });
    expect(confirmed.screen).toBe("taste");
    expect(confirmed.preview?.confirmed).toBe(true);
    expect(buildConfirmedInput(confirmed).ok).toBe(true);
  });

  it("allows the deterministic solver only after confirmation", () => {
    const preview = buildRoomPreview(initialState().room);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const withPreview = reduceState(initialState(), { type: "PREVIEW_ROOM_SUCCESS", preview: preview.preview });
    const confirmed = reduceState(withPreview, { type: "CONFIRM_ROOM" });
    const result = solveConfirmed(confirmed, loadCatalog().state);
    expect(result.ok).toBe(true);
  });

  it("keeps a completed result selectable and applies typed adjustments to the next input", () => {
    const preview = buildRoomPreview(initialState().room);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    let state = reduceState(initialState(), { type: "PREVIEW_ROOM_SUCCESS", preview: preview.preview });
    state = reduceState(state, { type: "CONFIRM_ROOM" });
    const solved = solveConfirmed(state, loadCatalog().state);
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;
    state = reduceState(state, { type: "SOLVE_RESULT", output: solved.output });
    expect(state.screen).toBe("result");
    expect(selectedPlan(state)?.id).toBe(solved.output.kind === "plan" ? solved.output.plan.id : undefined);
    const stale = reduceState(state, { type: "SET_TASTE_TEXT", value: "a different brief" });
    expect(stale.output).toBeUndefined();
    state = reduceState(state, { type: "SOLVE_RESULT", output: solved.output });
    state = reduceState(state, { type: "SET_FIXTURE_WANT", fixture: "tub", value: true });
    state = reduceState(state, { type: "SET_DOOR_OFFSET", value: "25" });
    const adjusted = buildConfirmedInput(state);
    expect(adjusted.ok).toBe(true);
    if (adjusted.ok) {
      expect(adjusted.input.openings[0]?.alongOffsetMm).toBe(25);
      expect(adjusted.input.featureConstraints.classCountRanges.tub).toEqual({ min: 1, max: 1 });
    }
    expect(state.adjustmentsDirty).toBe(true);
    expect(state.adjustmentKind).toBe("global");
  });

  it("fulfills offline low_flow taste with the verified Kumin faucet", () => {
    const catalog = loadCatalog().state;
    expect(catalog.skus.some((sku) => sku.feature_tags.includes("low_flow"))).toBe(true);
    let state = initialState();
    const preview = buildRoomPreview(state.room);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    state = reduceState(state, { type: "PREVIEW_ROOM_SUCCESS", preview: preview.preview });
    state = reduceState(state, { type: "CONFIRM_ROOM" });
    const taste = offlineTasteToFeatures("modern low-flow");
    expect(taste?.requiredFeatures).toEqual(["low_flow"]);
    if (!taste) throw new Error("missing offline taste constraints");
    state = reduceState(state, {
      type: "SET_TASTE_STATUS", status: "success", constraints: taste, posture: "offline",
    });
    const input = buildConfirmedInput(state);
    expect(input.ok).toBe(true);
    if (!input.ok) return;
    expect(input.input.featureConstraints.requiredFeatures).toContain("low_flow");
    const solved = solveConfirmed(state, catalog);
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;
    expect(solved.output.kind).toBe("plan");
    if (solved.output.kind !== "plan") return;
    expect(solved.output.plan.bom.lineItems.length).toBeGreaterThan(0);
    state = reduceState(state, { type: "SOLVE_RESULT", output: solved.output });
    expect(state.screen).toBe("result");
    expect(selectedPlan(state)?.id).toBe(solved.output.plan.id);
  });

  it("completes the offline room → taste → result → adjust → render loop", () => {
    const catalog = loadCatalog().state;
    let state = initialState();
    const preview = buildRoomPreview(state.room);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    state = reduceState(state, { type: "PREVIEW_ROOM_SUCCESS", preview: preview.preview });
    state = reduceState(state, { type: "CONFIRM_ROOM" });
    const taste = offlineTasteToFeatures("single-lever");
    expect(taste).not.toBeNull();
    state = reduceState(state, {
      type: "SET_TASTE_STATUS",
      status: "success",
      constraints: taste ?? EMPTY_FEATURE_CONSTRAINTS,
      posture: "offline",
    });

    const solved = solveConfirmed(state, catalog);
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;
    state = reduceState(state, { type: "SOLVE_RESULT", output: solved.output });
    const firstPlan = selectedPlan(state);
    expect(firstPlan).not.toBeNull();
    if (!firstPlan) return;
    const firstInput = buildConfirmedInput(state);
    expect(firstInput.ok).toBe(true);
    if (!firstInput.ok) return;
    const firstRender = buildRenderGeometry(firstPlan, firstInput.input);
    expect(firstRender.fixtures.map(({ modelId }) => modelId).sort()).toEqual(
      firstPlan.bom.lineItems.map(({ model_id }) => model_id).sort(),
    );

    state = reduceState(state, { type: "SET_SPACIOUSNESS", value: "compact" });
    expect(state.adjustmentsDirty).toBe(true);
    const adjusted = reoptimizeConfirmed(state, catalog, {
      kind: "weights",
      priority: state.taste.priority,
      spaciousness: state.taste.spaciousness,
    });
    expect(adjusted.ok).toBe(true);
    if (!adjusted.ok) return;
    state = reduceState(state, { type: "SOLVE_RESULT", output: adjusted.output });
    const adjustedPlan = selectedPlan(state);
    expect(adjustedPlan).not.toBeNull();
    if (!adjustedPlan) return;
    const adjustedInput = buildConfirmedInput(state);
    expect(adjustedInput.ok).toBe(true);
    if (!adjustedInput.ok) return;
    expect(buildRenderGeometry(adjustedPlan, adjustedInput.input).fixtures).toHaveLength(
      adjustedPlan.selectedCandidate.bindings.length,
    );
    expect(adjustedPlan.receipt.firedRuleTrace.every(({ pass }) => pass)).toBe(true);
    expect(state.adjustmentsDirty).toBe(false);
  });
});

describe("T-016 deterministic taste fallback", () => {
  it("maps closed-vocabulary cues without inventing arbitrary tags", () => {
    const result = offlineTasteToFeatures("calm bathroom with rain shower, matte black, low-flow toilet and vanity");
    expect(result).toEqual({
      requiredFeatures: ["low_flow", "rain_shower"],
      finishFamilies: ["matte_black"],
      preferredClasses: ["shower", "toilet", "vanity"],
      classCountRanges: {},
    });
  });

  it("leaves blank taste as an explicit empty state", () => {
    expect(offlineTasteToFeatures("")).toBeNull();
  });
});

describe("SET_STYLE_PRESET", () => {
  it("selects a preset with its finish family, and toggles off keeping finishes", () => {
    const on = reduceState(initialState(), { type: "SET_STYLE_PRESET", preset: "japandi", finishFamily: "matte_black" });
    expect(on.taste.stylePreset).toBe("japandi");
    expect(on.taste.featureConstraints.finishFamilies).toEqual(["matte_black"]);
    const other = reduceState(on, { type: "SET_STYLE_PRESET", preset: "coastal" });
    expect(other.taste.stylePreset).toBe("coastal");
    expect(other.taste.featureConstraints.finishFamilies).toEqual(["matte_black"]);
    const off = reduceState(other, { type: "SET_STYLE_PRESET", preset: "coastal", finishFamily: "brushed_nickel" });
    expect(off.taste.stylePreset).toBeUndefined();
    expect(off.taste.featureConstraints.finishFamilies).toEqual(["matte_black"]);
  });
});

describe("T-036 wanted-fixtures list", () => {
  function confirmed(): AppState {
    const preview = buildRoomPreview(initialState().room);
    if (!preview.ok) throw new Error(preview.message);
    return reduceState(reduceState(initialState(), { type: "PREVIEW_ROOM_SUCCESS", preview: preview.preview }), { type: "CONFIRM_ROOM" });
  }

  it("defaults to toilet + shower + auto sink, excluding tub and accessories", () => {
    const input = buildConfirmedInput(confirmed());
    if (!input.ok) throw new Error(input.message);
    const r = input.input.featureConstraints.classCountRanges;
    expect(r.toilet).toEqual({ min: 1, max: 1 });
    expect(r.shower).toEqual({ min: 1, max: 1 });
    expect(r.tub).toEqual({ min: 0, max: 0 });
    expect(r.accessory).toEqual({ min: 0, max: 0 });
    expect(r.basin).toBeUndefined();
    expect(r.vanity).toBeUndefined();
  });

  it("maps the sink choice to exactly one sink class", () => {
    let state = reduceState(confirmed(), { type: "SET_SINK", value: "basin" });
    let input = buildConfirmedInput(state);
    if (!input.ok) throw new Error(input.message);
    expect(input.input.featureConstraints.classCountRanges.basin).toEqual({ min: 1, max: 1 });
    expect(input.input.featureConstraints.classCountRanges.vanity).toEqual({ min: 0, max: 0 });
    state = reduceState(state, { type: "SET_SINK", value: "vanity" });
    input = buildConfirmedInput(state);
    if (!input.ok) throw new Error(input.message);
    expect(input.input.featureConstraints.classCountRanges.vanity).toEqual({ min: 1, max: 1 });
  });

  it("refuses a brief with neither shower nor tub", () => {
    const state = reduceState(confirmed(), { type: "SET_FIXTURE_WANT", fixture: "shower", value: false });
    const input = buildConfirmedInput(state);
    expect(input.ok).toBe(false);
    if (!input.ok) expect(input.message).toContain("shower, a tub");
  });

  it("a tub-only list solves to a plan without a shower", () => {
    let state = reduceState(confirmed(), { type: "SET_FIXTURE_WANT", fixture: "tub", value: true });
    state = reduceState(state, { type: "SET_FIXTURE_WANT", fixture: "shower", value: false });
    const result = solveConfirmed(state, loadCatalog().state);
    if (!result.ok) throw new Error(result.message);
    const plan = result.output.kind === "plan" ? result.output.plan : result.output.kind === "relaxation" ? result.output.menu[0].plan : null;
    expect(plan).not.toBeNull();
    const classes = plan!.selectedCandidate.bindings.map((b) => b.fixture.class);
    expect(classes).not.toContain("shower");
  });

  it("editing the list on the Result page marks the plan dirty as a global change", () => {
    let state = confirmed();
    const solved = solveConfirmed(state, loadCatalog().state);
    if (!solved.ok) throw new Error(solved.message);
    state = reduceState(state, { type: "SOLVE_RESULT", output: solved.output });
    state = reduceState(state, { type: "SET_FIXTURE_WANT", fixture: "accessory", value: true });
    expect(state.output).toBeDefined();
    expect(state.adjustmentsDirty).toBe(true);
    expect(state.adjustmentKind).toBe("global");
  });
});

describe("T-041 priority tabs", () => {
  const catalog = loadCatalog().state;
  function confirmed(): AppState {
    const preview = buildRoomPreview(initialState().room);
    if (!preview.ok) throw new Error(preview.message);
    return reduceState(reduceState(initialState(), { type: "PREVIEW_ROOM_SUCCESS", preview: preview.preview }), { type: "CONFIRM_ROOM" });
  }
  function solved(state: AppState): AppState {
    state = reduceState(state, { type: "SOLVE_START" });
    const result = solveConfirmed(state, catalog);
    if (!result.ok) throw new Error(result.message);
    return reduceState(state, { type: "SOLVE_RESULT", output: result.output, profiles: result.profiles });
  }

  it("a solve yields a validated plan for every priority, all within the maximum budget", () => {
    const state = solved(confirmed());
    const tabs = priorityTabs(state);
    expect(tabs.map((t) => t.priority)).toEqual(["value", "balanced", "eco-low-maintenance", "luxury"]);
    for (const tab of tabs) expect(tab.plan.cost).toBeLessThanOrEqual(250000);
    expect(tabs.find((t) => t.priority === "luxury")!.plan.cost).toBeGreaterThan(tabs.find((t) => t.priority === "value")!.plan.cost);
  });

  it("opens on Balanced and switching tabs changes the plan without a re-solve", () => {
    let state = solved(reduceState(confirmed(), { type: "SELECT_PRIORITY", value: "luxury" }));
    expect(state.taste.priority).toBe("balanced");
    const balanced = selectedPlan(state);
    state = reduceState(state, { type: "SELECT_PRIORITY", value: "value" });
    expect(state.adjustmentsDirty).toBe(false);
    expect(state.solveStatus).toBe("success");
    expect(selectedPlan(state)?.id).not.toBe(balanced?.id);
    expect(selectedPlan(state)?.id).toBe(priorityTabs(state).find((t) => t.priority === "value")!.plan.id);
  });

  it("tags a tab whose plan repeats an earlier tab", () => {
    const low = reduceState(reduceState(confirmed(), { type: "SET_BUDGET", field: "bTarget", value: "40000" }), { type: "SET_BUDGET", field: "bMax", value: "60000" });
    const tabs = priorityTabs(solved(low));
    for (const tab of tabs) {
      const first = tabs.find((t) => t.plan.selectedCandidate.id === tab.plan.selectedCandidate.id)!;
      expect(tab.sameAs).toBe(first === tab ? undefined : first.priority);
    }
  });

  it("recovery options each carry their own tabs", () => {
    let state = reduceState(confirmed(), { type: "SET_SINK", value: "vanity" });
    state = reduceState(reduceState(state, { type: "SET_BUDGET", field: "bTarget", value: "40000" }), { type: "SET_BUDGET", field: "bMax", value: "60000" });
    state = solved(state);
    expect(state.output?.kind).toBe("relaxation");
    expect(priorityTabs(state)).toHaveLength(4);
    expect(priorityTabs(state).every((t) => t.plan.cost <= (state.output?.kind === "relaxation" ? state.output.menu[0].plan.budgetSummary.bMax : 0))).toBe(true);
  });
});
