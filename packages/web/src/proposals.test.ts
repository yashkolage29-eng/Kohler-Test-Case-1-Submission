import { describe, expect, it, vi, afterEach } from "vitest";
import { initialState, buildRoomPreview, reduceState, selectedPlan, type AppState } from "./store.js";
import { decorFromResponse, decorKey, roomProposalKey, reviewRoomProposal, requestPhotoProposal, requestProposal } from "./proposals.js";
import { roomAiPanel } from "./ai-panels.js";
import { offlineDecorProposal, type DecorProposal, type Plan, type RoomProposal } from "@kolher/engine";

const proposal: RoomProposal = { operations: [{ op: "dimension", field: "widthMm", value: 3200 }] };
const decor: DecorProposal = { style: { palette: ["#8b5e3c"], metal: "brass", lightTemp: "warm" }, items: [{ type: "pendant", anchor: "ceiling-center", size: "m" }] };
function ready(): AppState {
  const state = initialState();
  const result = buildRoomPreview(state.room);
  if (!result.ok) throw new Error(result.message);
  return reduceState(reduceState(state, { type: "PREVIEW_ROOM_SUCCESS", preview: result.preview }), { type: "CONFIRM_ROOM" });
}
function proposed(state = ready()): AppState {
  const key = roomProposalKey(state);
  return reduceState(reduceState(state, { type: "ROOM_AI_START", key }), { type: "ROOM_AI_RESULT", key, proposal });
}
afterEach(() => vi.unstubAllGlobals());

describe("review then Apply", () => {
  it("does not mutate room until Apply and supports atomic undo and cancel", () => {
    const original = ready();
    const pending = proposed(original);
    expect(pending.room).toEqual(original.room);
    expect(pending.preview).toEqual(original.preview);
    const applied = reduceState(pending, { type: "ROOM_AI_APPLY" });
    expect(applied.room.widthMm).toBe("3200");
    expect(applied.preview?.confirmed).toBe(false);
    expect(applied.roomEditor?.history).toHaveLength(1);
    expect(reduceState(applied, { type: "UNDO_ROOM_EDIT" }).room).toEqual(original.room);
    const cancelled = reduceState(applied, { type: "CANCEL_ROOM_EDIT" });
    expect(cancelled.room).toEqual(original.room);
    expect(cancelled.preview).toEqual(original.preview);
  });
  it("rejects invalid dimensions and openings without partial application", () => {
    const state = ready();
    const invalid: RoomProposal = { operations: [...proposal.operations, { op: "opening", id: "window-1", kind: "window", wallId: "missing", alongOffsetMm: 0, spanMm: 600, swing: "in" }] };
    expect(reviewRoomProposal(state, invalid)?.error).toBeTruthy();
    const key = roomProposalKey(state);
    const pending = reduceState(reduceState(state, { type: "ROOM_AI_START", key }), { type: "ROOM_AI_RESULT", key, proposal: invalid });
    expect(reduceState(pending, { type: "ROOM_AI_APPLY" }).room).toEqual(state.room);
  });
  it("discards stale responses, including edit followed by undo", () => {
    let state = reduceState(ready(), { type: "EDIT_ROOM" });
    const key = roomProposalKey(state);
    state = reduceState(state, { type: "ROOM_AI_START", key });
    state = reduceState(state, { type: "SET_ROOM_FIELD", field: "widthMm", value: "3000" });
    state = reduceState(state, { type: "UNDO_ROOM_EDIT" });
    expect(reduceState(state, { type: "ROOM_AI_RESULT", key, proposal }).roomProposal).toBeUndefined();
  });
  it("preserves a previous proposal on request failure and ignores cancellation races", () => {
    let state = proposed();
    const key = roomProposalKey(state);
    state = reduceState(state, { type: "ROOM_AI_START", key });
    expect(reduceState(state, { type: "ROOM_AI_ERROR", key }).roomProposal).toEqual(state.roomProposal);
    state = reduceState(state, { type: "ROOM_AI_CANCEL" });
    expect(reduceState(state, { type: "ROOM_AI_RESULT", key, proposal }).roomProposal).toBeUndefined();
  });
  it("renders a photo proposal review list with explicit Apply", () => {
    const state = ready();
    const key = roomProposalKey(state);
    const photo = reduceState(reduceState(state, { type: "ROOM_AI_START", key }), { type: "ROOM_AI_RESULT", key, proposal, source: "photo" });
    const html = roomAiPanel(photo);
    expect(html).toContain("Apply proposed changes");
    expect(html).toContain("3200 mm");
    expect(html).toContain("not applied");
  });
});

describe("AI error surfacing and photo proposals", () => {
  it("surfaces the server's error message on non-2xx and a generic one when absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ code: "no-openings-detected", error: "No doors or windows were recognised in the photo." }) }));
    await expect(requestPhotoProposal("data:image/png;base64,AA==", ready().preview!)).rejects.toThrow("No doors or windows were recognised in the photo.");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => { throw new Error("not json"); } }));
    await expect(requestProposal("room-edit", "wider", ready().preview!)).rejects.toThrow("AI request unavailable");
  });
  it("sends the photo with the current room and validates the proposal", async () => {
    const opening: RoomProposal = { operations: [{ op: "opening", id: "window-1", kind: "window", wallId: "wall-top", alongOffsetMm: 100, spanMm: 600, swing: "in" }] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, proposal: opening }) });
    vi.stubGlobal("fetch", fetchMock);
    const room = ready().preview!;
    await expect(requestPhotoProposal("data:image/png;base64,AA==", room)).resolves.toEqual(opening);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent).toEqual({ request: "photo", image: "data:image/png;base64,AA==", room: JSON.parse(JSON.stringify(room)) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, proposal: { operations: [{ op: "opening", price: 1 }] } }) }));
    await expect(requestPhotoProposal("data:image/png;base64,AA==", room)).rejects.toThrow();
  });
  it("shows the specific room-edit error and marks photo proposals in review without applying", () => {
    const state = ready();
    const key = roomProposalKey(state);
    const failed = reduceState(reduceState(state, { type: "ROOM_AI_START", key }), { type: "ROOM_AI_ERROR", key, message: "The AI provider timed out." });
    expect(failed.roomAiMessage).toBe("The AI provider timed out.");
    const photo = reduceState(reduceState(state, { type: "ROOM_AI_START", key }), { type: "ROOM_AI_RESULT", key, proposal, source: "photo" });
    expect(photo.roomProposal?.source).toBe("photo");
    expect(photo.room).toEqual(state.room);
    expect(roomAiPanel(photo)).toContain("From your photo — positions are estimates. Check them before applying.");
    // No text-edit panel on the room page: only photo proposals render (T-030).
    expect(roomAiPanel(proposed(state))).toBe("");
    expect(roomAiPanel(state)).toBe("");
  });
});

describe("AI décor state and response mapping", () => {
  const plan = (ids: string[]): Plan => ({ selectedCandidate: { bindings: ids.map((skuId) => ({ fixture: { skuId, class: "toilet" } })) } }) as unknown as Plan;
  it("keys on sorted fixture models and normalised taste text", () => {
    expect(decorKey(plan(["b", "a"]), "  Calm SPA ")).toBe(decorKey(plan(["a", "b"]), "calm spa"));
    expect(decorKey(plan(["a"]), "calm")).not.toBe(decorKey(plan(["a", "c"]), "calm"));
  });
  it("maps ok to ai, fallback to offline and garbage to the local offline proposal", () => {
    expect(decorFromResponse({ ok: true, task: "decor", proposal: decor }, "calm")).toEqual({ proposal: decor, source: "ai" });
    expect(decorFromResponse({ fallback: true, reason: "x", task: "decor", proposal: decor }, "calm")).toEqual({ proposal: decor, source: "offline" });
    for (const body of [null, "nope", { ok: true, proposal: { style: {}, items: [] } }, { ok: false, proposal: decor }]) {
      expect(decorFromResponse(body, "warm wood")).toEqual({ proposal: offlineDecorProposal("warm wood"), source: "offline" });
    }
  });
  it("drops stale or superseded décor results", () => {
    let state = reduceState(ready(), { type: "DECOR_START", key: "a" });
    expect(state.decorStatus).toBe("loading");
    state = reduceState(state, { type: "DECOR_START", key: "b" });
    expect(reduceState(state, { type: "DECOR_RESULT", key: "a", proposal: decor, source: "ai" })).toBe(state);
    state = reduceState(state, { type: "DECOR_RESULT", key: "b", proposal: decor, source: "offline" });
    expect(state.decor).toEqual({ key: "b", proposal: decor, source: "offline" });
    expect(state.decorStatus).toBe("done");
    expect(state.decorRequest).toBeUndefined();
    expect(reduceState(state, { type: "DECOR_RESULT", key: "b", proposal: decor, source: "ai" })).toBe(state);
  });
});
