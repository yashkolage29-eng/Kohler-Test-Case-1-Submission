import type { AppState } from "./store.js";
import { reviewRoomProposal } from "./proposals.js";

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

/** Review → Apply panel for doors/windows read from a room photo. Never auto-applied. */
export function roomAiPanel(state: AppState): string {
  if (!state.preview || state.roomProposal?.source !== "photo") return "";
  const review = reviewRoomProposal(state, state.roomProposal.value);
  const loading = state.roomAiStatus === "loading";
  return `<section class="ai-editor" aria-label="Photo room edits"><div class="proposal-review"><h4>Proposed changes — not applied</h4><p class="photo-note">From your photo — positions are estimates. Check them before applying.</p>${review ? `<ul>${review.changes.map((change) => `<li>${esc(change)}</li>`).join("")}</ul>` : ""}${!review || review.error ? `<p class="form-error" role="alert">${esc(review?.error ?? "Unsupported proposal. Upload the photo again.")}</p>` : '<p class="section-note">Dimension and opening checks passed. Apply changes the preview only; confirmation is still required.</p>'}<p class="section-note">Applying may replace manual room values. Undo and Cancel room editing restore earlier work.</p><div class="button-row"><button class="primary-button" data-action="apply-proposal" data-focus-key="apply-proposal" ${!review || review.error || loading ? "disabled" : ""}>Apply proposed changes</button><button class="text-button" data-action="cancel-proposal" data-focus-key="cancel-proposal">Discard</button></div></div></section>`;
}
