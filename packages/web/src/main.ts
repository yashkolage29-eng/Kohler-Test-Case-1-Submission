import {
  loadCatalog,
  buildRenderGeometry,
  buildWallStrips,
  stripPoint,
  placeDecor,
  type BuildOutput,
  type DecorProposal,
  type PlacedDecor,
  type FixtureClass,
  type Plan,
  type FeatureTag,
  type FinishFamily,
  type Priority,
  type Spaciousness,
  type InputSet,
  type Vec2,
  type StylePreset,
  FINISHES,
  STYLES,
  STYLE_PRESETS,
  styleDecorProposal,
} from "@kolher/engine";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/600-italic.css";
import "@fontsource-variable/inter";
import "./styles.css";
import {
  buildConfirmedInput,
  buildRoomPreview,
  createAppStore,
  resolveTaste,
  reoptimizeConfirmed,
  selectedPlan,
  solveConfirmed,
  type AppState,
  type RoomSelection,
} from "./store.js";
import { mountRender3d } from "./render3d/index.js";
import { dragCandidate, type DragCandidate, type DragTarget } from "./roomDrag.js";
import { roomAiPanel } from "./ai-panels.js";
import { decorFixtures, decorFromResponse, decorKey, roomProposalKey, requestPhotoProposal } from "./proposals.js";

let disposeRender: (() => void) | undefined;
/** Décor keys whose stage-in animation already played (reveal once per key). */
let revealedDecorKey: string | undefined;
/** AI-only décor results; offline fallbacks are never cached so a later retry can reach AI. */
const decorCache = new Map<string, DecorProposal>();
let decorController: AbortController | undefined;
let decorStartedAt = 0;
const DECOR_TIMEOUT_MS = 12000;

const catalog = loadCatalog().state;
const store = createAppStore();
const root = document.querySelector<HTMLElement>("#app");
let tradeoffRequestId = 0;

const FEATURE_LABELS: Partial<Record<FeatureTag, string>> = {
  smart: "Smart", bidet: "Bidet", heated_seat: "Heated seat", dual_flush: "Dual flush",
  low_flow: "Low-flow", rain_shower: "Rain shower", thermostatic: "Thermostatic",
  touchless: "Touchless", single_lever: "Single lever", comfort_height: "Comfort height",
  elongated: "Elongated", soft_close: "Soft-close",
};
const FINISH_LABELS: Record<FinishFamily, string> = {
  white: "White", chrome: "Chrome", brushed_nickel: "Brushed nickel",
  matte_black: "Matte black", brushed_gold: "Brushed gold", stone: "Stone",
};
// Only offer feature/finish options the loaded catalog can actually satisfy.
// Catalog SKUs that fail evidence verification are quarantined at load, so the
// loaded set — not the authored wish-list — is the honest option source.
const AVAILABLE_TAGS = new Set<FeatureTag>(catalog.skus.flatMap((sku) => sku.feature_tags));
const FAMILY_OF_FINISH = new Map(FINISHES.map((finish) => [finish.id, finish.family]));
const AVAILABLE_FINISH_FAMILIES = new Set<FinishFamily>(
  catalog.skus.flatMap((sku) => sku.finish_options)
    .map((finishId) => FAMILY_OF_FINISH.get(finishId))
    .filter((family) => family !== undefined),
);
const FIXTURE_LABELS: Record<FixtureClass, string> = {
  toilet: "Toilet",
  basin: "Basin",
  faucet: "Faucet",
  shower: "Shower",
  tub: "Tub",
  vanity: "Vanity",
  accessory: "Accessory",
};

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

function money(value: number): string {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)}`;
}

function icon(name: "taste" | "arrow" | "check" | "upload"): string {
  const paths: Record<string, string> = {
    taste: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/><circle cx="12" cy="12" r="3"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

function activePlan(state: AppState): Plan | null {
  return selectedPlan(state);
}

async function requestTradeoffs(output: BuildOutput): Promise<void> {
  const requestId = ++tradeoffRequestId;
  if (output.kind !== "relaxation") return;
  try {
    const response = await fetch("/api/nim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: "tradeoffs", menu: output.menu.map(({ kind, tradeoffDelta }) => ({ kind, tradeoffDelta })) }),
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) {
      const body = await response.json() as { tradeoffs?: unknown };
      if (requestId !== tradeoffRequestId) return;
      if (Array.isArray(body.tradeoffs) && body.tradeoffs.every((item) => typeof item === "string")) {
        store.dispatch({ type: "TRADEOFF_RESULT", value: body.tradeoffs });
        return;
      }
    }
  } catch {
    // Engine-generated tradeoffDelta remains the offline source of truth.
  }
  if (requestId !== tradeoffRequestId) return;
  store.dispatch({ type: "TRADEOFF_RESULT", value: output.menu.map((item) => item.tradeoffDelta) });
}

/** Ask the server for taste-driven décor for the active plan. One request in flight;
 *  never retried; AI results cached per key; any failure falls back to offline décor. */
async function requestDecor(): Promise<void> {
  const state = store.getState();
  const plan = activePlan(state);
  if (!plan) return;
  const key = decorKey(plan, state.taste.text, state.taste.stylePreset);
  if (state.decor?.key === key || state.decorRequest === key) return;
  decorController?.abort();
  decorController = undefined;
  const cached = decorCache.get(key);
  store.dispatch({ type: "DECOR_START", key });
  // A chosen style preset is curated and deterministic: no NIM call (40 RPM budget).
  if (state.taste.stylePreset) {
    store.dispatch({ type: "DECOR_RESULT", key, proposal: styleDecorProposal(state.taste.stylePreset), source: "style" });
    return;
  }
  if (cached) {
    store.dispatch({ type: "DECOR_RESULT", key, proposal: cached, source: "ai" });
    return;
  }
  const controller = new AbortController();
  decorController = controller;
  decorStartedAt = performance.now();
  const text = state.taste.text.slice(0, 4000);
  let body: unknown = null;
  try {
    const response = await fetch("/api/nim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: "decor", text, fixtures: decorFixtures(plan) }),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(DECOR_TIMEOUT_MS)]),
    });
    if (response.ok) body = await response.json();
  } catch {
    // Timeout, no server or network failure: the offline décor below is the fallback.
  }
  if (controller.signal.aborted) return; // superseded by a newer key
  decorController = undefined;
  const result = decorFromResponse(body, text);
  if (result.source === "ai") decorCache.set(key, result.proposal);
  store.dispatch({ type: "DECOR_RESULT", key, ...result });
}

function roomPreviewSvg(state: AppState): string {
  const preview = state.preview;
  if (!preview) return '<div class="preview-empty"><span class="preview-empty-mark">+</span><p>Your confirmed outline will appear here.</p><small>Dimensions stay authoritative. Photo cues never override them.</small></div>';
  return outlineSvg(state, preview.polygon.vertices, preview.openings);
}

/** Frame of a drawing: SVG y = maxY - room y; the viewBox is pinned while dragging. */
interface OutlineFrame { maxY: number; viewBox: string; live?: { label: string; error?: string } }

function outlineFrame(vertices: Vec2[]): OutlineFrame {
  const maxX = Math.max(...vertices.map((point) => point.x));
  const maxY = Math.max(...vertices.map((point) => point.y));
  return { maxY, viewBox: `-120 -120 ${maxX + 240} ${maxY + 240}` };
}

function outlineSvg(state: AppState, vertices: Vec2[], openings: InputSet["openings"], frame: OutlineFrame = outlineFrame(vertices)): string {
  const { maxY } = frame;
  const minX = Math.min(...vertices.map((point) => point.x));
  const maxX = Math.max(...vertices.map((point) => point.x));
  const minY = Math.min(...vertices.map((point) => point.y));
  const points = vertices.map((point) => `${point.x},${maxY - point.y}`).join(" ");
  const polygon = { vertices, ccw: true as const, wallThicknessMm: 100 };
  const walls = buildWallStrips(polygon);
  const selectable = (kind: "wall" | "opening", id: string, label: string): string => `data-room-element="${kind}" data-element-id="${esc(id)}" data-focus-key="${kind}-${esc(id)}" role="button" tabindex="0" aria-label="${esc(label)}" aria-pressed="${Boolean(state.roomEditor && state.roomSelection?.kind === kind && state.roomSelection.id === id)}"`;
  // Drag handles follow polygon edge order (the drag module moves edge i = vertices i, i+1).
  const wallLines = vertices.map((start, edge) => {
    const end = vertices[(edge + 1) % vertices.length];
    const wall = walls.find((strip) => { const a = stripPoint(strip, 0); const b = stripPoint(strip, strip.usableLengthMm); return (a.x === start.x && a.y === start.y && b.x === end.x && b.y === end.y) || (a.x === end.x && a.y === end.y && b.x === start.x && b.y === start.y); });
    const id = wall?.id ?? `edge-${edge}`;
    const cursor = start.x === end.x ? "ew" : "ns";
    return `<g class="preview-element drag-${cursor}" data-drag="wall" data-drag-edge="${edge}" ${selectable("wall", id, `${id}: ${wall?.usableLengthMm ?? 0} mm. Drag to resize or select to edit`)}><line class="preview-hit" x1="${start.x}" y1="${maxY - start.y}" x2="${end.x}" y2="${maxY - end.y}" /><line class="preview-wall" x1="${start.x}" y1="${maxY - start.y}" x2="${end.x}" y2="${maxY - end.y}" /></g>`;
  }).join("");
  const openingLines = openings.map((opening) => {
    const wall = walls.find((strip) => strip.id === opening.wallId);
    if (!wall) return "";
    const start = stripPoint(wall, opening.alongOffsetMm);
    const end = stripPoint(wall, opening.alongOffsetMm + opening.spanMm);
    return `<g class="preview-element drag-move" data-drag="opening" data-drag-id="${esc(opening.id)}" ${selectable("opening", opening.id, `${opening.kind} ${opening.id}: ${opening.spanMm} mm. Drag along or onto another wall, or select to edit`)}><line class="preview-hit" x1="${start.x}" y1="${maxY - start.y}" x2="${end.x}" y2="${maxY - end.y}" /><line class="preview-${opening.kind}" x1="${start.x}" y1="${maxY - start.y}" x2="${end.x}" y2="${maxY - end.y}" /></g>`;
  }).join("");
  const corner = vertices.length === 6 ? `<circle class="preview-corner drag-move" data-drag="corner" cx="${vertices[4].x}" cy="${maxY - vertices[4].y}" r="48"><title>Drag to change the L-shape cut</title></circle>` : "";
  const live = frame.live ? `<text class="drag-label ${frame.live.error ? "invalid" : ""}" x="${(minX + maxX) / 2}" y="${maxY - minY + 85}">${esc(frame.live.error?.split(". ")[0] ?? frame.live.label)}</text>` : `<text x="${(minX + maxX) / 2}" y="${maxY - minY + 85}">${Math.round(maxX - minX)} mm</text>
    <text class="vertical-label" x="${maxX + 80}" y="${maxY - (Math.max(...vertices.map((point) => point.y)) + minY) / 2}">${Math.round(Math.max(...vertices.map((point) => point.y)) - minY)} mm</text>`;
  return `<svg class="room-preview-svg ${frame.live ? "dragging" : ""} ${frame.live?.error ? "drag-invalid" : ""}" viewBox="${frame.viewBox}" role="group" aria-label="Authoritative room outline preview">
    <polygon points="${points}" data-action="edit-room" />
    ${wallLines}${openingLines}${corner}
    ${live}
  </svg>`;
}

function shell(state: AppState, content: string): string {
  const roomActive = state.screen === "room";
  const tasteActive = state.screen === "taste";
  const resultActive = state.screen === "result";
  return `<div class="app-shell">
    <header class="topbar"><a class="brand" href="#" data-action="reset" aria-label="KOHLER planner home"><span class="brand-word">KOHLER</span><span class="brand-sub">AI Bathroom Designer</span></a><div class="topbar-note">Buildability-first planning</div></header>
    <main>
      <nav class="stepper" aria-label="Design progress">
        <button class="step ${roomActive ? "active" : "complete"}" data-action="go-room"><span class="step-icon">01</span><span><strong>Room</strong><small>Set the authority</small></span></button>
        <span class="step-line ${roomActive ? "" : "complete"}"></span>
        <button class="step ${tasteActive ? "active" : "complete"}" data-action="go-taste" ${state.preview?.confirmed ? "" : "disabled"}><span class="step-icon">02</span><span><strong>Taste</strong><small>Steer the outcome</small></span></button>
        <span class="step-line ${resultActive ? "complete" : ""}"></span>
        <button class="step ${resultActive ? "active" : ""}" data-action="go-result" ${state.output && !state.adjustmentsDirty ? "" : "disabled"}><span class="step-icon">03</span><span><strong>Result</strong><small>Validate and take it away</small></span></button>
      </nav>
      ${content}
    </main>
    <footer class="footer"><span>Planning-level guidance · verify with a qualified professional</span><span>Offline core ready</span></footer>
  </div>`;
}

function roomEditorControls(state: AppState): string {
  if (!state.roomEditor) return "";
  const walls = state.preview ? buildWallStrips(state.preview.polygon) : [];
  const selection = state.roomSelection;
  const opening = selection?.kind === "opening" ? state.preview?.openings.find((item) => item.id === selection.id) : undefined;
  const wall = selection?.kind === "wall" ? walls.find((item) => item.id === selection.id) : undefined;
  return `<section class="room-editor" aria-label="Room editor"><h3>Editing room</h3><p class="section-note">Select a wall, door, or window. Tab to an element and press Enter or Space to select it. Escape cancels; Ctrl/Cmd+Z undoes outside text fields.</p>
    <label class="select-field"><span>Selected element</span><select data-room-selection data-focus-key="room-selection">${walls.map((item) => `<option value="wall:${esc(item.id)}" ${wall?.id === item.id ? "selected" : ""}>${esc(item.id)} · ${item.usableLengthMm} mm</option>`).join("")}${state.preview?.openings.map((item) => `<option value="opening:${esc(item.id)}" ${opening?.id === item.id ? "selected" : ""}>${esc(item.id)} · ${item.kind}</option>`).join("") ?? ""}</select></label>
    ${opening ? `<form class="form-stack opening-form" data-form="opening"><h4>${esc(opening.id)}</h4><label class="select-field"><span>Wall</span><select name="wallId" data-focus-key="opening-wall">${!walls.some((item) => item.id === opening.wallId) ? `<option value="${esc(opening.wallId)}">${esc(opening.wallId)} (unavailable)</option>` : ""}${walls.map((item) => `<option value="${esc(item.id)}" ${item.id === opening.wallId ? "selected" : ""}>${esc(item.id)} · ${item.usableLengthMm} mm</option>`).join("")}</select></label><div class="field-grid"><label class="field"><span>Offset from wall start (mm)</span><div class="input-wrap"><input name="alongOffsetMm" data-focus-key="opening-offset" type="number" min="0" step="any" required value="${opening.alongOffsetMm}" /></div></label><label class="field"><span>Span (mm)</span><div class="input-wrap"><input name="spanMm" data-focus-key="opening-span" type="number" min="0.1" step="any" required value="${opening.spanMm}" /></div></label></div><div class="button-row"><button type="submit" class="secondary-button" data-focus-key="apply-opening">Apply opening</button>${opening.kind === "window" ? `<button type="button" class="secondary-button" data-action="remove-window" data-focus-key="remove-window">Remove window</button>` : ""}</div></form>` : `<p class="section-note">${wall ? `${esc(wall.id)} · ${wall.usableLengthMm} mm. ` : ""}Use the room width and depth${state.room.shape === "l-shape" ? ", cut width and cut depth" : ""} fields, or drag a wall on the preview. Walls stay joined.</p><button class="text-button" data-action="focus-room-dimensions">Edit room dimensions</button>`}
    ${state.roomError ? `<p class="form-error" role="alert">${esc(state.roomError)}</p>` : ""}<div class="button-row editor-actions"><button class="secondary-button" data-action="add-window" data-focus-key="add-window" ${state.preview ? "" : "disabled"}>Add window</button><button class="secondary-button" data-action="undo-room" data-focus-key="undo-room" ${state.roomEditor.history.length ? "" : "disabled"}>Undo</button><button class="secondary-button" data-action="cancel-room" data-focus-key="cancel-room">Cancel</button><button class="primary-button" data-action="confirm-room" data-focus-key="confirm-room" ${state.preview ? "" : "disabled"}>Confirm room ${icon("check")}</button></div></section>`;
}

export function roomScreen(state: AppState): string {
  const room = state.room;
  const hasPreview = Boolean(state.preview);
  return shell(state, `<section class="screen room-screen">
    <div class="screen-copy"><h1>Make the room measurable.</h1><p class="lede">Start with the dimensions you trust. Add a photo for context, then confirm the outline before any design is generated.</p><div class="trust-note"><span class="trust-icon" aria-hidden="true"></span><span><strong>Your dimensions stay in charge.</strong><br />AI can suggest cues, never authoritative geometry.</span></div>
      <form class="form-stack" data-form="room"><fieldset><legend>Room outline</legend><div class="segmented" role="group" aria-label="Room shape"><button type="button" aria-pressed="${room.shape === "rectangle"}" class="segment ${room.shape === "rectangle" ? "selected" : ""}" data-shape="rectangle">Rectangle</button><button type="button" aria-pressed="${room.shape === "l-shape"}" class="segment ${room.shape === "l-shape" ? "selected" : ""}" data-shape="l-shape">L-shape</button></div><div class="field-grid">${numberField("widthMm", "Width", room.widthMm, "2400", "mm")}${numberField("depthMm", "Depth", room.depthMm, "1800", "mm")}</div>${room.shape === "l-shape" ? `<div class="field-grid l-fields">${numberField("notchWidthMm", "Cut width", room.notchWidthMm, "900", "mm")}${numberField("notchDepthMm", "Cut depth", room.notchDepthMm, "900", "mm")}</div>` : ""}</fieldset>
        <fieldset><legend>Photo context <span class="optional">optional</span></legend><label class="upload-zone" for="room-photo"><span class="upload-icon">${icon("upload")}</span><span><strong>${room.photoName ? esc(room.photoName) : "Add a room photo"}</strong><small>AI reads doors and windows for you to review · JPG, PNG up to 700 KB</small></span><input id="room-photo" type="file" accept="image/png,image/jpeg" /></label>${state.photoStatus === "loading" ? `<p class="inline-status loading" role="status"><span class="spinner"></span>${esc(state.photoMessage ?? "Reading doors and windows from your photo…")}</p>` : state.photoMessage ? `<p class="inline-status ${state.photoStatus === "error" ? "error" : "success"}" role="${state.photoStatus === "error" ? "alert" : "status"}">${esc(state.photoMessage)}</p>` : ""}</fieldset>
        ${state.roomError ? `<p class="form-error" role="alert">${esc(state.roomError)}</p>` : ""}<button class="primary-button" type="button" data-action="preview-room">Preview room ${icon("arrow")}</button>
      </form>
      ${roomAiPanel(state)}
    </div>
    <aside class="preview-panel ${hasPreview ? "has-preview" : ""}"><div class="panel-header"><div><span class="panel-label">Plan preview</span><h2>${hasPreview ? (state.preview?.confirmed ? "Room confirmed" : "Check the outline") : "Your room, in proportion"}</h2></div><span class="panel-chip">${room.shape === "l-shape" ? "L-shape" : "Rectangle"}</span></div><div class="preview-canvas">${roomPreviewSvg(state)}</div>${state.roomEditor ? roomEditorControls(state) : hasPreview && !state.preview?.confirmed ? `<div class="confirmation-bar"><div><strong>Does this match the room?</strong><span>Drag walls, doors, windows or the L-cut corner to adjust. Select one to type exact values.</span></div><div class="button-row"><button class="secondary-button" data-action="edit-room">Edit</button><button class="primary-button compact" data-action="confirm-room">Confirm room ${icon("check")}</button></div></div>` : hasPreview ? `<div class="confirmed-bar"><span>${icon("check")}</span><span><strong>Geometry locked for this brief.</strong> You can still edit it before generating a new plan.</span></div>` : `<div class="preview-legend"><span><i class="legend-line"></i> room boundary</span><span><i class="legend-door"></i> door opening</span><span><i class="legend-window"></i> window</span></div>`}</aside>
  </section>`);
}

function numberField(field: string, label: string, value: string, placeholder: string, suffix: string): string {
  return `<label class="field"><span>${label}</span><div class="input-wrap"><input inputmode="decimal" data-room-field="${field}" value="${esc(value)}" placeholder="${placeholder}" /><b>${suffix}</b></div></label>`;
}

function tasteScreen(state: AppState): string {
  const taste = state.taste;
  const features = taste.featureConstraints.requiredFeatures.filter((tag) => FEATURE_LABELS[tag]);
  const finishes = taste.featureConstraints.finishFamilies;
  const planMessage = state.solveStatus === "loading" ? `<div class="inline-status loading"><span class="spinner"></span>Checking the brief against the deterministic engine…</div>` : state.solveMessage ? `<div class="inline-status error" role="alert">${esc(state.solveMessage)}</div>` : state.solveStatus === "success" && state.output ? outputSummary(state.output) : `<div class="empty-state"><span class="empty-icon">${icon("taste")}</span><div><strong>No plan yet.</strong><p>Add a little direction, then the engine will validate a plan against your confirmed room.</p></div></div>`;
  return shell(state, `<section class="screen taste-screen"><div class="screen-copy"><button class="back-link" data-action="go-room">← Edit room</button><h1>Give the room a point of view.</h1><p class="lede">Describe the feeling in your own words. The AI maps it to closed catalog features; the engine remains the final authority.</p>
      <form class="form-stack" data-form="taste">${styleCards(taste.stylePreset)}<div class="taste-columns"><div class="taste-col"><fieldset><legend>What should it feel like?</legend><textarea data-taste-text maxlength="4000" placeholder="For example: a calm, modern guest bath with a rain shower, chrome fittings, and low-flow fixtures.">${esc(taste.text)}</textarea><div class="taste-actions"><button class="secondary-button" type="button" data-action="analyze-taste" ${state.tasteStatus === "loading" ? "disabled" : ""}>${state.tasteStatus === "loading" ? "Mapping…" : "Map taste to features"} ${icon("arrow")}</button><span class="ai-badge ${state.aiPosture}"><i></i>${state.aiPosture === "offline" ? "Offline fallback ready" : "AI adapter connected"}</span></div>${state.tasteMessage ? `<p class="inline-status ${state.tasteStatus === "error" ? "error" : "success"}">${esc(state.tasteMessage)}</p>` : ""}</fieldset>
        <fieldset><legend>Feature constraints <span class="optional">editable</span></legend><div class="chip-list">${features.length ? features.map((tag) => `<button type="button" aria-pressed="true" class="chip selected" data-feature="${tag}">${esc(FEATURE_LABELS[tag] ?? tag)} ×</button>`).join("") : `<span class="chip-empty">No required features yet. Map taste or choose below.</span>`}</div><div class="chip-list suggestion-list">${(["rain_shower", "thermostatic", "low_flow", "smart", "soft_close"] as FeatureTag[]).filter((tag) => AVAILABLE_TAGS.has(tag)).map((tag) => `<button type="button" aria-pressed="${features.includes(tag)}" class="chip suggestion ${features.includes(tag) ? "selected" : ""}" data-feature="${tag}">${esc(FEATURE_LABELS[tag] ?? tag)}</button>`).join("")}</div><div class="chip-list finish-list">${Object.entries(FINISH_LABELS).filter(([family]) => AVAILABLE_FINISH_FAMILIES.has(family as FinishFamily)).map(([family, label]) => `<button type="button" aria-pressed="${finishes.includes(family as FinishFamily)}" class="chip finish-chip ${finishes.includes(family as FinishFamily) ? "selected" : ""}" data-finish="${family}">${esc(label)}</button>`).join("")}</div></fieldset></div>
        <div class="taste-col taste-solve"><fieldset><legend>Steer the trade-off</legend><label class="select-field"><span>Priority</span><select data-priority>${(["value", "balanced", "luxury", "eco-low-maintenance"] as Priority[]).map((value) => `<option value="${value}" ${taste.priority === value ? "selected" : ""}>${value === "eco-low-maintenance" ? "Eco + low maintenance" : value[0].toUpperCase() + value.slice(1)}</option>`).join("")}</select></label><div class="choice-row"><span class="choice-label">Spaciousness</span><div class="segmented wide">${(["compact", "balanced", "airy"] as Spaciousness[]).map((value) => `<button type="button" aria-pressed="${taste.spaciousness === value}" class="segment ${taste.spaciousness === value ? "selected" : ""}" data-spaciousness="${value}">${value[0].toUpperCase() + value.slice(1)}</button>`).join("")}</div></div><div class="field-grid budget-fields">${numberField("bTarget", "Target budget", taste.bTarget, "180000", "₹")}${numberField("bMax", "Maximum budget", taste.bMax, "250000", "₹")}</div></fieldset>
        <button class="primary-button" type="button" data-action="generate" ${state.solveStatus === "loading" ? "disabled" : ""}>Generate validated plan ${icon("arrow")}</button>${planMessage}</div></div>
      </form></div></section>`);
}

function outputSummary(output: AppState["output"]): string {
  if (!output) return "";
  if (output.kind === "plan") return `<div class="success-panel" role="status"><span class="success-icon">${icon("check")}</span><div><strong>Validated plan ready.</strong><p>${output.plan.selectedCandidate.bindings.length} fixtures · ${money(output.plan.cost)} · all hard rules passed.</p><small>Results, 2D/3D views, receipt, and export continue in the next flow.</small></div></div>`;
  if (output.kind === "relaxation") return `<div class="success-panel" role="status"><span class="success-icon">${icon("check")}</span><div><strong>Brief needs a trade-off.</strong><p>${output.menu.length} validated option${output.menu.length === 1 ? "" : "s"} found.</p></div></div>`;
  return `<div class="inline-status error" role="alert">No buildable plan fits this brief yet. ${esc(output.outOfScope.finalBlocker)}</div>`;
}

function fixtureLabel(value: FixtureClass): string {
  return FIXTURE_LABELS[value];
}

function resultVisual(plan: Plan, state: AppState): string {
  return `<div class="render-panel">
    <div class="render-toolbar"><div><span class="panel-label">Authoritative representation</span><strong>Procedural 3D room view</strong></div><div class="render-controls"><label class="view-select"><span>Style</span><select data-result-style aria-label="Style preset" ${state.solveStatus === "loading" ? "disabled" : ""}><option value="" ${state.taste.stylePreset ? "" : "selected"}>No style</option>${STYLE_PRESETS.map((key) => `<option value="${key}" ${state.taste.stylePreset === key ? "selected" : ""}>${esc(STYLES[key].label)}</option>`).join("")}</select></label><label class="view-select"><span>View</span><select data-render-view aria-label="Camera view"></select></label></div></div>
    <div class="render-canvas-wrap"><canvas data-render-canvas="3d" width="900" height="560" aria-label="Procedural 3D bathroom layout"></canvas>${decorOverlay(plan, state)}</div>
    <div class="render-caption"><span>${plan.selectedCandidate.bindings.length} placed fixtures · exact AABBs from the engine</span><span>${state.adjustmentsDirty ? "Pending changes — re-optimize to update the render" : "Planning-level · verify on site"}</span></div>
    ${decorCaption(plan, state)}
  </div>`;
}

const SPARKLE = '<svg class="ai-spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/></svg>';

/** "AI is working" cue over the 3D canvas while décor loads, then a small source chip.
 *  Pure CSS animation; a negative delay keeps step progress across full re-renders. */
function decorOverlay(plan: Plan, state: AppState): string {
  if (state.adjustmentsDirty) return "";
  const key = decorKey(plan, state.taste.text, state.taste.stylePreset);
  if (state.decorStatus === "loading" && state.decorRequest === key) {
    const elapsed = Math.max(0, Math.round(performance.now() - decorStartedAt));
    return `<div class="ai-working" style="--ai-elapsed: -${elapsed}ms"><span class="ai-shimmer" aria-hidden="true"></span><span class="ai-pill">${SPARKLE}<span class="ai-steps" aria-hidden="true"><span>Reading your taste…</span><span>Choosing lights &amp; mirrors…</span><span>Placing décor…</span></span><span class="ai-static" aria-hidden="true">AI is styling your room…</span><span class="sr-only" role="status" aria-live="polite">AI is styling your room from your taste.</span></span></div>`;
  }
  if (state.decor?.key === key) {
    const enter = revealedDecorKey !== key ? " ai-chip-enter" : "";
    if (state.decor.source === "style" && state.taste.stylePreset) return `<span class="ai-chip${enter}" role="status">${esc(STYLES[state.taste.stylePreset].label)}</span>`;
    return state.decor.source === "ai"
      ? `<span class="ai-chip${enter}" role="status">✦ Styled by AI</span>`
      : `<span class="ai-chip offline${enter}" role="status">Styled offline</span>`;
  }
  return "";
}

/** Caption suffix when the render adds a presentation-only counter under standalone deck products. */
function supportNote(plan: Plan): string {
  const deck = plan.selectedCandidate.bindings.some((b) => (b.fixture.class === "basin" && !b.fixture.featureTags.includes("wall_mount")) || b.fixture.class === "faucet");
  return deck ? " · counter under basin/faucet shown for context, not included" : "";
}

const FLOOR_LABELS: Record<string, string> = { marble: "Marble", microcement: "Microcement", hinoki: "Hinoki", oak: "Oak", "white-oak": "White oak", herringbone: "Herringbone", granite: "Granite" };
const WALL_LABELS: Record<string, string> = { paint: "Paint", concrete: "Concrete", plaster: "Clay plaster", limewash: "Limewash", brick: "Brick", tile: "Tile" };

/** Curated style cards; picking one sets décor, room materials and a finish-family suggestion. */
function styleCards(selected: StylePreset | undefined): string {
  return `<fieldset><legend>Pick a style <span class="optional">optional</span></legend><div class="style-grid">${STYLE_PRESETS.map((key) => {
    const def = STYLES[key];
    const on = selected === key;
    return `<button type="button" class="style-card ${on ? "selected" : ""}" aria-pressed="${on}" data-style-preset="${key}"><span class="style-swatches" aria-hidden="true">${def.palette.map((hex) => `<i style="background:${hex}"></i>`).join("")}</span><strong>${esc(def.label)}</strong><small>${esc(def.blurb)}</small><em>${esc(FLOOR_LABELS[def.floor])} floor · ${esc(WALL_LABELS[def.wall])} walls · ${esc(FINISH_LABELS[def.finishFamily])}</em></button>`;
  }).join("")}</div></fieldset>`;
}

function decorCaption(plan: Plan, state: AppState): string {
  const key = decorKey(plan, state.taste.text, state.taste.stylePreset);
  if (state.adjustmentsDirty || (state.decor?.key !== key && state.decorRequest !== key)) return "";
  const source = state.decor?.key === key ? state.decor.source : "ai";
  const origin = source === "style" && state.taste.stylePreset ? `curated for ${STYLES[state.taste.stylePreset].label}` : `styled ${source === "offline" ? "offline" : "by AI"} from your taste`;
  const support = supportNote(plan);
  return `<p class="render-decor-note">Décor ${esc(origin)} · not KOHLER products · not in the BOM${support}</p>`;
}

function planBOM(plan: Plan, state: AppState): string {
  const rows = plan.bom.lineItems.map((item) => `<tr><td><strong>${esc(item.model_id)}</strong><small>${item.qty} × ${item.finish ? esc(item.finish) : "Catalog finish"}</small></td><td>${money(item.price * item.qty)}</td></tr>`).join("");
  return `<section class="result-section bom-section"><div class="section-heading"><div><span class="panel-label">Bill of materials</span><h2>What the plan calls for</h2></div><button class="secondary-button compact" data-action="export-bom" ${state.adjustmentsDirty ? "disabled title=\"Re-optimize before exporting\"" : ""}>Download BOM</button></div><div class="bom-table-wrap"><table class="bom-table"><thead><tr><th>Model</th><th>Line total</th></tr></thead><tbody>${rows || `<tr><td colspan="2">No line items were returned.</td></tr>`}</tbody><tfoot><tr><th>Total</th><th>${money(plan.bom.total)}</th></tr></tfoot></table></div></section>`;
}

function adjustmentPanel(state: AppState): string {
  const taste = state.taste;
  const door = state.preview?.openings.find((opening) => opening.kind === "door");
  const wall = state.preview ? buildWallStrips(state.preview.polygon).find((strip) => strip.id === door?.wallId) : undefined;
  const maxDoor = Math.max(0, (wall?.usableLengthMm ?? 700) - (door?.spanMm ?? 700));
  const fixtureOptions = (["", ...Object.keys(FIXTURE_LABELS)] as (FixtureClass | "")[]).map((value) => `<option value="${value}" ${state.adjustments.fixtureClass === value ? "selected" : ""}>${value ? `Require ${fixtureLabel(value)}` : "Keep current fixture mix"}</option>`).join("");
  return `<section class="adjust-panel"><div class="section-heading"><div><span class="panel-label">Adjust and re-roll</span><h2>Change the brief, keep the proof</h2></div><span class="panel-chip">Deterministic re-run</span></div><p class="section-note">Every change below re-enters the same validator. The current plan stays visible until a completed result replaces it.</p><div class="adjust-grid"><label class="select-field"><span>Priority</span><select data-adjust-priority>${(["value", "balanced", "luxury", "eco-low-maintenance"] as Priority[]).map((value) => `<option value="${value}" ${taste.priority === value ? "selected" : ""}>${value === "eco-low-maintenance" ? "Eco + low maintenance" : value[0].toUpperCase() + value.slice(1)}</option>`).join("")}</select></label><label class="select-field"><span>Fixture mix</span><select data-fixture-class>${fixtureOptions}</select></label><div class="choice-row"><span class="choice-label">Spaciousness</span><div class="segmented wide">${(["compact", "balanced", "airy"] as Spaciousness[]).map((value) => `<button type="button" aria-pressed="${taste.spaciousness === value}" class="segment ${taste.spaciousness === value ? "selected" : ""}" data-adjust-spaciousness="${value}">${value[0].toUpperCase() + value.slice(1)}</button>`).join("")}</div></div><div class="field-grid budget-fields"><label class="field"><span>Target budget</span><div class="input-wrap"><input data-adjust-budget="bTarget" inputmode="numeric" value="${esc(taste.bTarget)}" /><b>₹</b></div></label><label class="field"><span>Maximum budget</span><div class="input-wrap"><input data-adjust-budget="bMax" inputmode="numeric" value="${esc(taste.bMax)}" /><b>₹</b></div></label></div><label class="range-field"><span><span>Door position</span><strong>${esc(state.adjustments.doorOffsetMm)} mm from wall start</strong></span><input type="range" data-door-offset min="0" max="${maxDoor}" step="25" value="${esc(state.adjustments.doorOffsetMm || "0")}" /></label></div><button class="primary-button" data-action="adjust" ${state.solveStatus === "loading" ? "disabled" : ""}>Re-optimize validated plan ${icon("arrow")}</button>${state.solveStatus === "loading" ? `<div class="inline-status loading"><span class="spinner"></span>Re-checking geometry, compatibility, and budget…</div>` : state.solveMessage ? `<div class="inline-status error" role="alert">${esc(state.solveMessage)}</div>` : ""}</section>`;
}

function relaxationChoices(output: Extract<BuildOutput, { kind: "relaxation" }>, state: AppState): string {
  const selected = state.selectedRelaxation ?? 0;
  return `<section class="relaxation-section"><div class="section-heading"><div><span class="panel-label">Impossible brief · validated alternatives</span><h2>That cannot all fit as written.</h2></div><span class="panel-chip warning-chip">${output.menu.length} way${output.menu.length === 1 ? "" : "s"}</span></div><p class="section-note">Each option changes one measured constraint, then runs a fresh full validation. Choose a path to inspect its plan.</p><div class="relaxation-list">${output.menu.map((item, index) => `<button aria-pressed="${selected === index}" class="relaxation-choice ${selected === index ? "selected" : ""}" data-relaxation-index="${index}"><span class="option-number">${index + 1}</span><span><strong>${esc(item.kind.replaceAll("-", " "))}</strong><small>${esc(state.tradeoffNarration?.[index] ?? item.tradeoffDelta)}</small><em>${money(item.plan.cost)} · ${item.plan.selectedCandidate.bindings.length} fixtures · validated</em></span></button>`).join("")}</div></section>`;
}

/** Presentation-only translation of engine blocker reason strings into user guidance.
 *  The engine's deterministic verdict is never altered — only how it reads. */
function humanizeBlocker(blocker: string): string {
  if (blocker.includes("no-valid-candidate")) {
    return "The catalog has no combination that satisfies every feature and finish you asked for together. Try removing a finish (e.g. brushed gold or matte black), dropping a required feature, or letting the engine pick alternatives.";
  }
  if (blocker.includes("opening-outside-wall") || blocker.includes("opening")) {
    return "The door or window does not fit the room as drawn. Check the room dimensions or door position.";
  }
  if (blocker.includes("budget") || blocker.includes("budget-exhausted")) {
    return "No validated plan fits inside the budget. Raise the maximum budget or reduce required features.";
  }
  if (blocker.includes("clearance") || blocker.includes("overlap") || blocker.includes("swing")) {
    return "The fixtures cannot be placed with legal clearances in this room. Try a larger room or fewer fixtures.";
  }
  return "The deterministic engine could not validate this brief. Adjust the room, taste constraints, or budget and try again.";
}

function resultScreen(state: AppState): string {
  const output = state.output;
  if (!output && state.solveStatus === "loading") return shell(state, `<section class="result-screen empty-result"><div class="empty-state loading-result"><span class="spinner"></span><div><strong>Re-checking the brief.</strong><p>The deterministic engine is validating geometry, compatibility, and budget before anything replaces the current result.</p></div></div></section>`);
  if (!output && state.solveMessage) return shell(state, `<section class="result-screen empty-result"><div class="empty-state"><span class="empty-icon">!</span><div><strong>That adjustment did not produce a validated result.</strong><p>${esc(state.solveMessage)}</p><button class="secondary-button compact" data-action="go-taste">Back to brief</button></div></div></section>`);
  if (!output) return shell(state, `<section class="result-screen empty-result"><div class="empty-state"><span class="empty-icon">${icon("taste")}</span><div><strong>No completed result yet.</strong><p>Return to Taste and run the deterministic engine before opening Results.</p><button class="primary-button compact" data-action="go-taste">Back to Taste</button></div></div></section>`);
  if (output.kind === "out-of-scope") return shell(state, `<section class="result-screen"><div class="outcome-banner error-banner"><span class="outcome-mark">!</span><div><span class="panel-label">Honest out-of-scope result</span><h1>There is no validated plan for this brief.</h1><p>${esc(humanizeBlocker(output.outOfScope.finalBlocker))}</p><p class="blocker-raw">${esc(output.outOfScope.finalBlocker)}</p><strong>Minimum viable catalog estimate: ${money(output.outOfScope.minViableCost)}</strong></div></div><div class="result-actions"><button class="secondary-button" data-action="go-taste">Adjust the brief</button></div></section>`);
  const plan = activePlan(state);
  if (!plan) return shell(state, `<section class="result-screen"><div class="empty-state"><strong>Select a validated alternative to continue.</strong></div></section>`);
  const isRelaxation = output.kind === "relaxation";
  return shell(state, `<section class="result-screen"><div class="result-header"><div><button class="back-link" data-action="go-taste">← Edit brief</button><span class="panel-label">${isRelaxation ? "Validated recovery path" : "Validated result"}</span><h1>${isRelaxation ? "A buildable way forward." : "A plan you can price."}</h1><p class="lede">${isRelaxation ? "Pick the measured trade-off that matters least, then inspect the same proof used to validate it." : "A deterministic candidate, a costed BOM, and a render sourced from the exact same geometry."}</p></div><div class="result-kpi"><span>Total plan</span><strong>${money(plan.cost)}</strong><small>${plan.selectedCandidate.bindings.length} fixtures · ${plan.budgetSummary.bMax >= plan.cost ? "within maximum budget" : "budget check failed"}</small></div></div>${isRelaxation ? relaxationChoices(output, state) : ""}<div class="result-layout"><div>${resultVisual(plan, state)}${planBOM(plan, state)}</div></div>${adjustmentPanel(state)}<div class="result-export"><div><span class="panel-label">Take it away</span><h2>Export the checked plan</h2><p>${state.adjustmentsDirty ? "Re-optimize before exporting so the artifact matches your pending changes." : "Download the BOM as CSV or the exact 2D layout as a PNG."}</p></div><div class="button-row"><button class="secondary-button" data-action="export-bom" ${state.adjustmentsDirty ? "disabled title=\"Re-optimize before exporting\"" : ""}>Download BOM</button><button class="primary-button" data-action="export-layout" ${state.adjustmentsDirty ? "disabled title=\"Re-optimize before exporting\"" : ""}>Download 2D layout</button></div></div></section>`);
}

function selectRoomElement(selection: RoomSelection): void {
  if (!store.getState().roomEditor) store.dispatch({ type: "EDIT_ROOM" });
  store.dispatch({ type: "SELECT_ROOM_ELEMENT", selection });
}

function focusRoomControl(key: string): void {
  root?.querySelector<HTMLElement | SVGElement>(`[data-focus-key="${CSS.escape(key)}"]`)?.focus();
}

/** Suppresses the click that follows a drag so it does not also select. */
let suppressClickUntil = 0;

function bindPreviewDrag(canvas: HTMLElement): void {
  canvas.addEventListener("pointerdown", (event) => {
    const state = store.getState();
    const handle = (event.target as Element).closest<SVGElement>("[data-drag]");
    const svg = canvas.querySelector<SVGSVGElement>("svg.room-preview-svg");
    const matrix = svg?.getScreenCTM()?.inverse();
    if (!handle || !svg || !matrix || !state.preview || event.button !== 0) return;
    const target: DragTarget = handle.dataset.drag === "wall" ? { kind: "wall", edge: Number(handle.dataset.dragEdge) }
      : handle.dataset.drag === "corner" ? { kind: "corner" } : { kind: "opening", id: handle.dataset.dragId ?? "" };
    const frame = { maxY: Math.max(...state.preview.polygon.vertices.map((point) => point.y)), viewBox: svg.getAttribute("viewBox") ?? "" };
    const toRoom = (e: PointerEvent): Vec2 => {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix);
      return { x: p.x, y: frame.maxY - p.y };
    };
    const start = toRoom(event);
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let candidate: DragCandidate | undefined;
    let lastValid: DragCandidate | undefined;
    canvas.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent): void => {
      if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return;
      dragging = true;
      const current = store.getState();
      if (!current.preview) return;
      candidate = dragCandidate(current.room, current.preview, target, start, toRoom(e));
      if (!candidate.error) lastValid = candidate;
      const shown = candidate.error && lastValid ? lastValid : candidate;
      canvas.innerHTML = outlineSvg(current, shown.vertices, shown.openings, { ...frame, live: { label: candidate.label, error: candidate.error } });
    };
    const end = (): void => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", end);
      canvas.removeEventListener("pointercancel", end);
      if (!dragging) return;
      suppressClickUntil = Date.now() + 300;
      if (lastValid) {
        if (!store.getState().roomEditor) store.dispatch({ type: "EDIT_ROOM" });
        store.dispatch({ type: "APPLY_ROOM_DRAG", room: lastValid.room, openings: lastValid.openings });
      } else {
        render(store.getState());
      }
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
  });
}

function bindEvents(): void {
  if (!root) return;
  const dragCanvas = root.querySelector<HTMLElement>(".room-screen .preview-canvas");
  if (dragCanvas) bindPreviewDrag(dragCanvas);
  root.querySelectorAll<SVGElement>("[data-room-element]").forEach((element) => {
    const select = (): void => {
      if (Date.now() < suppressClickUntil) return;
      selectRoomElement({ kind: element.dataset.roomElement as RoomSelection["kind"], id: element.dataset.elementId ?? "" });
      focusRoomControl(element.dataset.focusKey ?? "");
    };
    element.addEventListener("click", select);
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
  });
  root.querySelector<HTMLSelectElement>("[data-room-selection]")?.addEventListener("change", (event) => {
    const [kind, id] = (event.target as HTMLSelectElement).value.split(":");
    selectRoomElement({ kind: kind as RoomSelection["kind"], id });
  });
  root.querySelector<HTMLFormElement>("[data-form='opening']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    if (!form.reportValidity()) return;
    const state = store.getState();
    if (state.roomSelection?.kind !== "opening") return;
    const fields = new FormData(form);
    store.dispatch({ type: "UPDATE_OPENING", id: state.roomSelection.id, wallId: String(fields.get("wallId")), alongOffsetMm: Number(fields.get("alongOffsetMm")), spanMm: Number(fields.get("spanMm")) });
  });
  root.querySelector<HTMLFormElement>("[data-form='room']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleAction("preview-room");
  });
  root.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => element.addEventListener("click", () => void handleAction(element.dataset.action ?? "")));
  root.querySelectorAll<HTMLInputElement>("[data-room-field='widthMm'], [data-room-field='depthMm'], [data-room-field='notchWidthMm'], [data-room-field='notchDepthMm']").forEach((input) => input.addEventListener("input", () => store.dispatch({ type: "SET_ROOM_FIELD", field: input.dataset.roomField as "widthMm" | "depthMm" | "notchWidthMm" | "notchDepthMm", value: input.value })));
  root.querySelectorAll<HTMLButtonElement>("[data-shape]").forEach((button) => button.addEventListener("click", () => store.dispatch({ type: "SET_ROOM_SHAPE", shape: button.dataset.shape as "rectangle" | "l-shape" })));
  root.querySelector<HTMLTextAreaElement>("[data-taste-text]")?.addEventListener("input", (event) => store.dispatch({ type: "SET_TASTE_TEXT", value: (event.target as HTMLTextAreaElement).value }));
  root.querySelector<HTMLSelectElement>("[data-priority]")?.addEventListener("change", (event) => store.dispatch({ type: "SET_PRIORITY", value: (event.target as HTMLSelectElement).value as Priority }));
  root.querySelectorAll<HTMLButtonElement>("[data-spaciousness]").forEach((button) => button.addEventListener("click", () => store.dispatch({ type: "SET_SPACIOUSNESS", value: button.dataset.spaciousness as Spaciousness })));
  root.querySelectorAll<HTMLButtonElement>("[data-feature]").forEach((button) => button.addEventListener("click", () => store.dispatch({ type: "TOGGLE_FEATURE", tag: button.dataset.feature as FeatureTag })));
  root.querySelectorAll<HTMLButtonElement>("[data-style-preset]").forEach((button) => button.addEventListener("click", () => {
    const preset = button.dataset.stylePreset as StylePreset;
    const family = STYLES[preset].finishFamily;
    store.dispatch({ type: "SET_STYLE_PRESET", preset, finishFamily: AVAILABLE_FINISH_FAMILIES.has(family) ? family : undefined });
  }));
  // Result-page style switch: same state change as a style card, then re-solve at once.
  root.querySelector<HTMLSelectElement>("[data-result-style]")?.addEventListener("change", (event) => {
    const value = (event.target as HTMLSelectElement).value as StylePreset | "";
    const current = store.getState().taste.stylePreset;
    if (value === "" && current) store.dispatch({ type: "SET_STYLE_PRESET", preset: current });
    else if (value !== "") {
      const family = STYLES[value].finishFamily;
      store.dispatch({ type: "SET_STYLE_PRESET", preset: value, finishFamily: AVAILABLE_FINISH_FAMILIES.has(family) ? family : undefined });
    }
    void handleAction("generate");
  });
  root.querySelectorAll<HTMLButtonElement>("[data-finish]").forEach((button) => button.addEventListener("click", () => store.dispatch({ type: "SET_FINISH_FAMILY", family: button.dataset.finish as FinishFamily })));
  root.querySelectorAll<HTMLInputElement>("[data-room-field='bTarget'], [data-room-field='bMax']").forEach((input) => input.addEventListener("input", () => store.dispatch({ type: "SET_BUDGET", field: input.dataset.roomField as "bTarget" | "bMax", value: input.value })));
  root.querySelector<HTMLSelectElement>("[data-adjust-priority]")?.addEventListener("change", (event) => store.dispatch({ type: "SET_PRIORITY", value: (event.target as HTMLSelectElement).value as Priority }));
  root.querySelector<HTMLSelectElement>("[data-fixture-class]")?.addEventListener("change", (event) => store.dispatch({ type: "SET_FIXTURE_CLASS", value: (event.target as HTMLSelectElement).value as FixtureClass | "" }));
  root.querySelectorAll<HTMLButtonElement>("[data-adjust-spaciousness]").forEach((button) => button.addEventListener("click", () => store.dispatch({ type: "SET_SPACIOUSNESS", value: button.dataset.adjustSpaciousness as Spaciousness })));
  root.querySelectorAll<HTMLInputElement>("[data-adjust-budget]").forEach((input) => input.addEventListener("input", () => store.dispatch({ type: "SET_BUDGET", field: input.dataset.adjustBudget as "bTarget" | "bMax", value: input.value })));
  root.querySelector<HTMLInputElement>("[data-door-offset]")?.addEventListener("input", (event) => store.dispatch({ type: "SET_DOOR_OFFSET", value: (event.target as HTMLInputElement).value }));
  root.querySelectorAll<HTMLButtonElement>("[data-relaxation-index]").forEach((button) => button.addEventListener("click", () => void handleAction("select-relaxation", Number(button.dataset.relaxationIndex))));
  root.querySelector<HTMLInputElement>("#room-photo")?.addEventListener("change", (event) => void handlePhoto((event.target as HTMLInputElement).files?.[0]));
}

async function handlePhoto(file: File | undefined): Promise<void> {
  if (!file) return;
  if (file.size > 700_000) {
    store.dispatch({ type: "SET_PHOTO_STATUS", status: "error", message: "That image is larger than 700 KB. Choose a smaller photo." });
    return;
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("invalid photo"));
    reader.onerror = () => reject(reader.error ?? new Error("photo read failed"));
    reader.readAsDataURL(file);
  }).catch(() => null);
  if (!dataUrl) {
    store.dispatch({ type: "SET_PHOTO_STATUS", status: "error", message: "This photo could not be read. Try another image." });
    return;
  }
  store.dispatch({ type: "SET_PHOTO", name: file.name, dataUrl });
  if (!store.getState().preview) {
    store.dispatch({ type: "SET_PHOTO_PENDING", value: true });
    store.dispatch({ type: "SET_PHOTO_STATUS", status: "success", message: "Photo saved. Doors and windows will be read after you preview the room." });
    return;
  }
  await analyzePhoto();
}

/** Photo → door/window proposal into the existing Review → Apply flow. Never auto-applied. */
async function analyzePhoto(): Promise<void> {
  const state = store.getState();
  const image = state.room.photoDataUrl;
  store.dispatch({ type: "SET_PHOTO_PENDING", value: false });
  if (!image || !state.preview || state.roomAiStatus === "loading") return;
  const key = roomProposalKey(store.getState());
  store.dispatch({ type: "ROOM_AI_START", key });
  store.dispatch({ type: "SET_PHOTO_STATUS", status: "loading", message: "Reading doors and windows from your photo…" });
  try {
    const proposal = await requestPhotoProposal(image, state.preview);
    store.dispatch({ type: "ROOM_AI_RESULT", key, proposal, source: "photo" });
    const landed = store.getState().roomProposal?.source === "photo";
    store.dispatch({ type: "SET_PHOTO_STATUS", status: landed ? "success" : "idle", message: landed ? "Doors and windows found. Review them below before applying." : undefined, posture: "server" });
  } catch (error) {
    // The specific reason is shown once, beside the photo upload; the edit panel stays quiet.
    store.dispatch({ type: "ROOM_AI_ERROR", key, message: "" });
    store.dispatch({ type: "SET_PHOTO_STATUS", status: "error", message: error instanceof Error ? error.message : "The photo could not be analysed. Existing work is unchanged." });
  }
}

async function handleAction(action: string, value?: number): Promise<void> {
  const state = store.getState();
  if (action === "cancel-proposal") {
    store.dispatch({ type: "ROOM_AI_CANCEL" });
    return;
  }
  if (action === "apply-proposal") {
    if (window.confirm("Apply these proposed room values? They may replace manual changes. You can Undo or Cancel room editing afterward.")) store.dispatch({ type: "ROOM_AI_APPLY" });
    return;
  }
  if (action === "reset") {
    window.location.hash = "";
    window.location.reload();
    return;
  }
  if (action === "go-room" || action === "edit-room") {
    store.dispatch({ type: "EDIT_ROOM" });
    focusRoomControl("room-selection");
    return;
  }
  if (action === "go-taste" && state.preview?.confirmed) {
    store.dispatch({ type: "CONFIRM_ROOM" });
    return;
  }
  if (action === "go-result" && state.output && !state.adjustmentsDirty) {
    store.dispatch({ type: "SOLVE_RESULT", output: state.output });
    void requestDecor();
    return;
  }
  if (action === "preview-room") {
    const result = buildRoomPreview(state.room, state.preview?.openings);
    store.dispatch(result.ok ? { type: "PREVIEW_ROOM_SUCCESS", preview: result.preview } : { type: "PREVIEW_ROOM_ERROR", message: result.message });
    if (result.ok && store.getState().photoPending) void analyzePhoto();
    return;
  }
  if (action === "focus-room-dimensions") {
    root?.querySelector<HTMLInputElement>("[data-room-field='widthMm']")?.focus();
    return;
  }
  if (action === "add-window" || action === "undo-room" || action === "cancel-room" || action === "remove-window") {
    if (action === "add-window") store.dispatch({ type: "ADD_WINDOW" });
    if (action === "undo-room") store.dispatch({ type: "UNDO_ROOM_EDIT" });
    if (action === "cancel-room") store.dispatch({ type: "CANCEL_ROOM_EDIT" });
    if (action === "remove-window" && state.roomSelection?.kind === "opening") store.dispatch({ type: "REMOVE_WINDOW", id: state.roomSelection.id });
    if (action === "remove-window" || action === "undo-room") focusRoomControl("room-selection");
    if (action === "cancel-room") root?.querySelector<HTMLElement>("[data-action='edit-room'], [data-action='go-room']")?.focus();
    return;
  }
  if (action === "confirm-room") {
    store.dispatch({ type: "CONFIRM_ROOM" });
    return;
  }
  if (action === "analyze-taste") {
    store.dispatch({ type: "SET_TASTE_STATUS", status: "loading" });
    const resolution = await resolveTaste(store.getState().taste.text);
    store.dispatch({ type: "SET_TASTE_STATUS", status: "success", message: resolution.message, constraints: resolution.constraints, posture: resolution.posture });
    return;
  }
  if (action === "generate") {
    const gate = buildConfirmedInput(state);
    if (!gate.ok) {
      store.dispatch({ type: "SOLVE_ERROR", message: gate.message });
      return;
    }
    store.dispatch({ type: "SOLVE_START" });
    const result = solveConfirmed(store.getState(), catalog);
    if (result.ok) {
      store.dispatch({ type: "SOLVE_RESULT", output: result.output });
      void requestTradeoffs(result.output);
      void requestDecor();
    } else {
      store.dispatch({ type: "SOLVE_ERROR", message: result.message });
    }
    return;
  }
  
  if (action === "select-relaxation" && typeof value === "number") {
    store.dispatch({ type: "SELECT_RELAXATION", index: value });
    void requestDecor();
    return;
  }
  if (action === "adjust") {
    const before = store.getState();
    const change = before.adjustmentKind === "weights"
      ? { kind: "weights" as const, priority: before.taste.priority, spaciousness: before.taste.spaciousness }
      : before.adjustmentKind === "local"
        ? { kind: "local" as const, openingId: "door-1" }
        : { kind: "global" as const };
    store.dispatch({ type: "SOLVE_START", preserveOutput: true });
    const result = reoptimizeConfirmed(before, catalog, change);
    if (result.ok) {
      store.dispatch({ type: "SOLVE_RESULT", output: result.output });
      void requestTradeoffs(result.output);
      void requestDecor();
    } else {
      store.dispatch({ type: "SOLVE_ERROR", message: result.message, preserveOutput: true });
    }
    return;
  }
  if (action === "export-bom") {
    const plan = activePlan(state);
    if (!plan || state.adjustmentsDirty) return;
    const rows = ["model_id,quantity,finish,price,total", ...plan.bom.lineItems.map((item) => [item.model_id, item.qty, item.finish ?? "", item.price, item.price * item.qty].map(csvCell).join(","))];
    downloadFile(`kohler-plan-${plan.id}.csv`, "text/csv;charset=utf-8", rows.join("\n"));
    return;
  }
  if (action === "export-layout") {
    const plan = activePlan(state);
    const input = buildConfirmedInput(state);
    if (!plan || !input.ok || state.adjustmentsDirty) return;
    try {
      const threeD = root?.querySelector<HTMLCanvasElement>("[data-render-canvas='3d']");
      if (!threeD) return;
      downloadFile(`kohler-3d-scene-${plan.id}.png`, "image/png", threeD.toDataURL("image/png"));
    } catch {
      store.dispatch({ type: "SOLVE_ERROR", message: "The 3D scene could not be exported because its authoritative geometry was unavailable." });
    }
  }
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadFile(name: string, type: string, content: string): void {
  const anchor = document.createElement("a");
  anchor.download = name;
  anchor.href = content.startsWith("data:") ? content : `data:${type},${encodeURIComponent(content)}`;
  anchor.click();
}

function render(state: AppState): void {
  if (!root) return;
  // Typing fix: the full innerHTML re-render destroys the focused input on every
  // keystroke. Remember the focused field and its caret, then restore both after
  // the re-render so continuous typing works in every text input.
  const active = document.activeElement instanceof Element && root.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = active
    ? active.getAttribute("data-focus-key")
      ? `[data-focus-key="${CSS.escape(active.getAttribute("data-focus-key")!)}"]`
      : active.getAttribute("data-room-field")
      ? `[data-room-field="${active.getAttribute("data-room-field")}"]`
      : active.getAttribute("data-adjust-budget")
        ? `[data-adjust-budget="${active.getAttribute("data-adjust-budget")}"]`
        : active.hasAttribute("data-taste-text")
          ? "[data-taste-text]"
          : null
    : null;
  const editable = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  const caret = focusKey && editable && active.selectionStart !== null
    ? { start: active.selectionStart, end: active.selectionEnd ?? active.selectionStart }
    : null;
  disposeRender?.();
  disposeRender = undefined;
  root.innerHTML = state.screen === "room" ? roomScreen(state) : state.screen === "taste" ? tasteScreen(state) : resultScreen(state);
  bindEvents();
  if (focusKey) {
    const el = root.querySelector<HTMLElement | SVGElement>(focusKey);
    if (el) {
      el.focus({ preventScroll: true });
      if (caret && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) el.setSelectionRange(caret.start, caret.end);
    }
  }
  if (state.screen !== "result") return;
  const plan = activePlan(state);
  const input = buildConfirmedInput(state);
  if (!plan || !input.ok || state.adjustmentsDirty) return;
  try {
    const geometry = buildRenderGeometry(plan, input.input);
    const threeD = root.querySelector<HTMLCanvasElement>("[data-render-canvas='3d']");
    const key = decorKey(plan, state.taste.text, state.taste.stylePreset);
    let placed: PlacedDecor[] | undefined;
    if (state.decor?.key === key) {
      try {
        placed = placeDecor(state.decor.proposal, geometry);
      } catch {
        placed = undefined; // Décor is presentation only; never block the validated render.
      }
    }
    const reveal = Boolean(placed?.length) && revealedDecorKey !== key;
    if (placed) revealedDecorKey = key;
    const style = state.decor?.key === key ? state.decor.proposal.style : undefined;
    if (threeD) disposeRender = mountRender3d(threeD, geometry, catalog.skus, placed, { reveal, style, viewSelect: root.querySelector<HTMLSelectElement>("[data-render-view]") });
  } catch {
    const canvasWrap = root.querySelector<HTMLElement>(".render-canvas-wrap");
    if (canvasWrap) canvasWrap.insertAdjacentHTML("beforeend", `<p class="render-error">The renderer could not materialize this completed plan.</p>`);
  }
}

root?.addEventListener("keydown", (event) => {
  if (!store.getState().roomEditor || event.isComposing) return;
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  if (event.key === "Escape" && !(target instanceof HTMLSelectElement)) {
    event.preventDefault();
    void handleAction("cancel-room");
  } else if (!typing && (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    void handleAction("undo-room");
  } else if (!typing && event.key === "Delete") {
    event.preventDefault();
    void handleAction("remove-window");
  }
});

store.subscribe(render);
render(store.getState());
