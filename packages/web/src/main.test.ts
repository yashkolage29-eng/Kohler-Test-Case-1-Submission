import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildWallStrips, loadCatalog } from "@kolher/engine";
import { buildRoomPreview, initialState, reduceState, solveConfirmed, selectedPlan, type AppState } from "./store.js";

let roomScreen: typeof import("./main.js")["roomScreen"];
let planBOM: typeof import("./main.js")["planBOM"];
let bomCsv: typeof import("./main.js")["bomCsv"];
let priorityTabBar: typeof import("./main.js")["priorityTabBar"];

beforeAll(async () => {
  vi.stubGlobal("document", { querySelector: () => null });
  ({ roomScreen, planBOM, bomCsv, priorityTabBar } = await import("./main.js"));
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

describe("BOM product names (T-035)", () => {
  function solvedState(): AppState {
    const state = reduceState(previewState(), { type: "CONFIRM_ROOM" });
    const result = solveConfirmed(state, loadCatalog().state);
    if (!result.ok) throw new Error(result.message);
    return reduceState(state, { type: "SOLVE_RESULT", output: result.output });
  }

  it("shows each product's name next to its model id", () => {
    const state = solvedState();
    const plan = selectedPlan(state)!;
    const html = planBOM(plan, state);
    const skus = loadCatalog().state.skus;
    for (const item of plan.bom.lineItems) {
      const name = skus.find((sku) => sku.model_id === item.model_id)!.name;
      expect(html).toContain(`<strong>${name}</strong>`);
      expect(html).toContain(item.model_id);
    }
  });

  it("exports a name column in the CSV", () => {
    const plan = selectedPlan(solvedState())!;
    const [header, first] = bomCsv(plan).split("\n");
    expect(header).toBe("model_id,name,quantity,finish,price,total");
    const name = loadCatalog().state.skus.find((sku) => sku.model_id === plan.bom.lineItems[0].model_id)!.name;
    expect(first).toContain(name.includes(",") ? `"${name}"` : name);
  });
});

describe("priority tabs (T-041)", () => {
  function solvedState(bTarget = "180000", bMax = "250000"): AppState {
    let state = reduceState(previewState(), { type: "CONFIRM_ROOM" });
    state = reduceState(reduceState(state, { type: "SET_BUDGET", field: "bTarget", value: bTarget }), { type: "SET_BUDGET", field: "bMax", value: bMax });
    const result = solveConfirmed(state, loadCatalog().state);
    if (!result.ok) throw new Error(result.message);
    return reduceState(state, { type: "SOLVE_RESULT", output: result.output, profiles: result.profiles });
  }

  it("shows four tabs with a price each, Balanced selected, and differences against it", () => {
    const state = solvedState("40000", "60000");
    const html = priorityTabBar(state);
    for (const key of ["value", "balanced", "eco-low-maintenance", "luxury"]) expect(html).toContain(`data-priority-tab="${key}"`);
    expect(html).toMatch(/data-priority-tab="balanced"[^>]*aria-pressed="true"/);
    expect(html).toContain("₹40,400");
    expect(html).toContain("−₹2,630"); // value 37,770 vs balanced 40,400
    expect(html).toContain("+₹18,980"); // luxury 59,380 vs balanced 40,400
  });

  it("tags a repeated plan", () => {
    expect(priorityTabBar(solvedState("100000", "150000"))).toContain("Same as Balanced");
  });

  it("the default budget gives four different plans (T-042 premium catalog)", () => {
    expect(priorityTabBar(solvedState())).not.toContain("Same as");
  });

  it("renders nothing without tab plans", () => {
    expect(priorityTabBar(previewState())).toBe("");
  });
});
