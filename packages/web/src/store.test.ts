import { describe, expect, it } from "vitest";
import { buildRenderGeometry, buildWallStrips, loadCatalog } from "@kolher/engine";
import {
  buildConfirmedInput,
  buildRoomPreview,
  EMPTY_FEATURE_CONSTRAINTS,
  initialState,
  offlineTasteToFeatures,
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
    state = reduceState(state, { type: "SET_FIXTURE_CLASS", value: "tub" });
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

    state = reduceState(state, { type: "SET_PRIORITY", value: "luxury" });
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
