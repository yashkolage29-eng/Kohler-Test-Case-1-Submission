import { buildWallStrips, offlineDecorProposal, parseDecorProposal, parseRoomProposal, type DecorProposal, type DraftRoom, type Plan, type RoomProposal, type StylePreset } from "@kolher/engine";
import { buildRoomPreview, openingError, type AppState, type RoomDraft, type RoomPreview } from "./store.js";

export function roomProposalKey(state: AppState): string {
  return JSON.stringify([state.roomRevision ?? 0, state.room, state.preview]);
}

export function reviewRoomProposal(state: AppState, proposal: RoomProposal): { room: RoomDraft; preview: RoomPreview; changes: string[]; error?: string } | null {
  if (!state.preview || !parseRoomProposal(proposal)) return null;
  const room = { ...state.room };
  let openings = state.preview.openings.map((o) => ({ ...o }));
  const changes: string[] = [];
  for (const op of proposal.operations) {
    if (op.op === "dimension") {
      if (room.shape !== "l-shape" && (op.field === "notchWidthMm" || op.field === "notchDepthMm")) return null;
      changes.push(`${op.field}: ${room[op.field]} → ${op.value} mm`);
      room[op.field] = String(op.value);
    } else if (op.op === "remove-opening") {
      if (!openings.some((o) => o.id === op.id)) return null;
      changes.push(`Remove ${op.id}`);
      openings = openings.filter((o) => o.id !== op.id);
    } else {
      const previous = openings.find((o) => o.id === op.id);
      changes.push(`${previous ? "Update" : "Add"} ${op.kind} ${op.id}: ${previous ? `${previous.wallId}, offset ${previous.alongOffsetMm}, span ${previous.spanMm} → ` : ""}${op.wallId}, offset ${op.alongOffsetMm}, span ${op.spanMm} mm${op.kind === "door" ? `, swing ${op.swing}` : ""}`);
      const opening = { id: op.id, kind: op.kind, wallId: op.wallId, alongOffsetMm: op.alongOffsetMm, spanMm: op.spanMm, ...(op.kind === "door" ? { swing: { side: op.swing, leafDimsMm: { w: op.spanMm, d: 25 } } } : {}) };
      openings = [...openings.filter((o) => o.id !== op.id), opening];
    }
  }
  const result = buildRoomPreview(room, openings);
  if (!result.ok) return { room, preview: state.preview, changes, error: result.message };
  const error = openings.length > 20 ? "Keep at most 20 openings." : !openings.some((o) => o.kind === "door") ? "Keep at least one door before applying." : openingError(result.preview);
  return { room, preview: result.preview, changes, error };
}

const GENERIC_AI_ERROR = "AI request unavailable. Existing work is unchanged; retry or use manual controls.";

/** POST to /api/nim and return a validated room proposal. Non-2xx responses surface
 *  the server's user-readable `error` message when present. */
async function postRoomProposal(payload: Record<string, unknown>): Promise<RoomProposal> {
  const response = await fetch("/api/nim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" && body.error.trim() ? body.error : GENERIC_AI_ERROR;
    throw new Error(message);
  }
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("ok" in body) || body.ok !== true || !("proposal" in body)) throw new Error("AI returned no usable proposal. Existing work is unchanged.");
  const proposal = parseRoomProposal(body.proposal);
  if (!proposal) throw new Error("AI returned an invalid proposal. Existing work is unchanged.");
  return proposal;
}

export async function requestProposal(task: "room-edit", text: string, room: DraftRoom): Promise<RoomProposal> {
  return postRoomProposal({ request: task, text, room });
}

/** Photo → door/window opening proposal for the same Review → Apply flow. Never applied here. */
export async function requestPhotoProposal(image: string, room: DraftRoom): Promise<RoomProposal> {
  return postRoomProposal({ request: "photo", image, room });
}

/** Décor cache/stale key: the active plan's fixture models, the normalised taste text and the style preset. */
export function decorKey(plan: Plan, tasteText: string, preset?: StylePreset): string {
  return JSON.stringify([plan.selectedCandidate.bindings.map((binding) => binding.fixture.skuId).sort(), tasteText.trim().toLowerCase(), preset ?? ""]);
}

export function decorFixtures(plan: Plan): { fixtureClass: string; modelId: string }[] {
  return plan.selectedCandidate.bindings.slice(0, 20).map((binding) => ({ fixtureClass: binding.fixture.class, modelId: binding.fixture.skuId }));
}

/** Map a /api/nim décor response to a validated proposal. ok → "ai"; server fallback →
 *  "offline"; anything else (garbage, error, no server) → local offline proposal. */
export function decorFromResponse(body: unknown, tasteText: string): { proposal: DecorProposal; source: "ai" | "offline" } {
  if (typeof body === "object" && body !== null && "proposal" in body) {
    const proposal = parseDecorProposal(body.proposal);
    if (proposal && "ok" in body && body.ok === true) return { proposal, source: "ai" };
    if (proposal && "fallback" in body && body.fallback === true) return { proposal, source: "offline" };
  }
  return { proposal: parseDecorProposal(offlineDecorProposal(tasteText)) ?? offlineDecorProposal(tasteText), source: "offline" };
}

export function roomPromptContext(state: AppState): string {
  return `Current outline: ${JSON.stringify({ shape: state.room.shape, widthMm: state.room.widthMm, depthMm: state.room.depthMm, notchWidthMm: state.room.notchWidthMm, notchDepthMm: state.room.notchDepthMm, walls: state.preview ? buildWallStrips(state.preview.polygon).map(({ id, usableLengthMm }) => ({ id, usableLengthMm })) : [] })}. Requested edit: ${state.roomAiText ?? ""}`;
}
