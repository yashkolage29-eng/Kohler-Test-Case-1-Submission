import { roomProposalKey, reviewRoomProposal } from "./proposals.js";
import {
  type DecorProposal,
  type RoomProposal,
  DEFAULT_CONFIG,
  FEATURE_TAGS,
  FINISH_FAMILIES,
  FIXTURE_CLASSES,
  STYLES,
  DEFAULT_PRIORITY,
  alternativeProfiles,
  buildWallStrips,
  stripPoint,
  reoptimize,
  solve,
  type BuildOutput,
  type CatalogState,
  type FeatureConstraints,
  type FeatureTag,
  type FinishFamily,
  type FixtureClass,
  type InputSet,
  type Plan,
  type Priority,
  type RelaxationKind,
  type ReoptChange,
  type RoomPolygon,
  type Spaciousness,
  type StylePreset,
} from "@kolher/engine";

export type RoomShape = "rectangle" | "l-shape";
export type PriorityPlans = Partial<Record<Priority, Plan>>;
/** Result tab order, cheapest lean first. */
export const PRIORITY_TABS: Priority[] = ["value", "balanced", "eco-low-maintenance", "luxury"];
/** "style" = curated preset décor (no AI call). */
export type DecorSource = "ai" | "offline" | "style";
export type Screen = "room" | "taste" | "result";
export type AsyncStatus = "idle" | "loading" | "success" | "error";
export type ViewMode = "2d" | "3d";

export interface RoomDraft {
  shape: RoomShape;
  widthMm: string;
  depthMm: string;
  notchWidthMm: string;
  notchDepthMm: string;
  photoName: string;
  photoDataUrl?: string;
}

export interface RoomPreview {
  polygon: RoomPolygon;
  openings: InputSet["openings"];
  confirmed: boolean;
}

export interface TasteState {
  text: string;
  featureConstraints: FeatureConstraints;
  priority: Priority;
  spaciousness: Spaciousness;
  bTarget: string;
  bMax: string;
  /** Curated aesthetic (T-027b); drives décor + room materials without an AI call. */
  stylePreset?: StylePreset;
  /** T-036 wanted-fixtures list (toilet is always included). Checked = include,
   *  unchecked = exclude; the sink is one choice, "auto" = vanity when it fits. */
  fixtures: FixtureWants;
}

export type SinkChoice = "auto" | "vanity" | "basin";
export type OptionalFixture = "shower" | "tub" | "accessory";
export interface FixtureWants {
  shower: boolean;
  tub: boolean;
  accessory: boolean;
  sink: SinkChoice;
}

export const DEFAULT_FIXTURE_WANTS: FixtureWants = { shower: true, tub: false, accessory: false, sink: "auto" };

export type RoomSelection = { kind: "wall" | "opening"; id: string };

type RoomEditSnapshot = Pick<AppState, "roomSelection" | "room" | "preview" | "roomOpenings" | "roomError" | "screen" | "output" | "solveStatus" | "solveMessage" | "adjustments" | "adjustmentsDirty" | "adjustmentKind" | "selectedRelaxation" | "selectedRelaxationKind">;

export interface AppState {
  roomRevision?: number;
  roomAiText?: string;
  roomAiStatus?: AsyncStatus;
  roomAiMessage?: string;
  roomAiRequest?: string;
  roomProposal?: { value: RoomProposal; key: string; source?: "photo" };
  /** A photo added before any preview; analysed once after the next preview. */
  photoPending?: boolean;
  /** AI décor for the result render, keyed by active-plan fixtures + taste text. */
  decor?: { key: string; proposal: DecorProposal; source: DecorSource };
  decorStatus?: "idle" | "loading" | "done";
  decorRequest?: string;
  roomEditor?: { original: RoomEditSnapshot; history: RoomEditSnapshot[] };
  roomSelection?: RoomSelection;
  screen: Screen;
  room: RoomDraft;
  preview?: RoomPreview;
  roomOpenings?: InputSet["openings"];
  roomError?: string;
  photoStatus: AsyncStatus;
  photoMessage?: string;
  taste: TasteState;
  tasteStatus: AsyncStatus;
  tasteMessage?: string;
  aiPosture: "offline" | "server";
  solveStatus: AsyncStatus;
  solveMessage?: string;
  output?: BuildOutput;
  /** T-041: a validated plan per priority tab, one entry per plan/recovery option. */
  priorityPlans?: PriorityPlans[];
  viewMode: ViewMode;
  selectedRelaxation?: number;
  selectedRelaxationKind?: RelaxationKind;
  adjustments: {
    doorOffsetMm: string;
  };
  tradeoffNarration?: string[];
  adjustmentsDirty: boolean;
  adjustmentKind?: "weights" | "local" | "global";
}

export const EMPTY_FEATURE_CONSTRAINTS: FeatureConstraints = {
  requiredFeatures: [],
  preferredClasses: [],
  finishFamilies: [],
  classCountRanges: {},
};

export function initialState(): AppState {
  return {
    screen: "room",
    room: {
      shape: "rectangle",
      widthMm: "2400",
      depthMm: "1800",
      notchWidthMm: "900",
      notchDepthMm: "900",
      photoName: "",
    },
    photoStatus: "idle",
    taste: {
      text: "",
      featureConstraints: EMPTY_FEATURE_CONSTRAINTS,
      priority: "balanced",
      spaciousness: "balanced",
      bTarget: "180000",
      bMax: "250000",
      fixtures: DEFAULT_FIXTURE_WANTS,
    },
    tasteStatus: "idle",
    aiPosture: "offline",
    solveStatus: "idle",
    viewMode: "3d",
    adjustments: { doorOffsetMm: "" },
    adjustmentsDirty: false,
  };
}

export type Action =
  | { type: "ROOM_AI_TEXT"; value: string }
  | { type: "ROOM_AI_START"; key: string }
  | { type: "ROOM_AI_RESULT"; key: string; proposal: RoomProposal; source?: "photo" }
  | { type: "ROOM_AI_ERROR"; key: string; message?: string }
  | { type: "ROOM_AI_CANCEL" }
  | { type: "ROOM_AI_APPLY" }
  | { type: "DECOR_START"; key: string }
  | { type: "DECOR_RESULT"; key: string; proposal: DecorProposal; source: DecorSource }
  | { type: "SET_PHOTO_PENDING"; value: boolean }
  | { type: "SET_ROOM_FIELD"; field: keyof Pick<RoomDraft, "widthMm" | "depthMm" | "notchWidthMm" | "notchDepthMm">; value: string }
  | { type: "SET_ROOM_SHAPE"; shape: RoomShape }
  | { type: "SET_PHOTO"; name: string; dataUrl: string }
  | { type: "SET_PHOTO_STATUS"; status: AsyncStatus; message?: string; posture?: "offline" | "server" }
  | { type: "PREVIEW_ROOM_SUCCESS"; preview: RoomPreview }
  | { type: "PREVIEW_ROOM_ERROR"; message: string }
  | { type: "EDIT_ROOM" }
  | { type: "SELECT_ROOM_ELEMENT"; selection: RoomSelection }
  | { type: "UNDO_ROOM_EDIT" }
  | { type: "CANCEL_ROOM_EDIT" }
  | { type: "UPDATE_OPENING"; id: string; wallId: string; alongOffsetMm: number; spanMm: number }
  | { type: "APPLY_ROOM_DRAG"; room: RoomDraft; openings: InputSet["openings"] }
  | { type: "ADD_WINDOW" }
  | { type: "REMOVE_WINDOW"; id: string }
  | { type: "CONFIRM_ROOM" }
  | { type: "SET_TASTE_TEXT"; value: string }
  | { type: "SET_TASTE_STATUS"; status: AsyncStatus; message?: string; constraints?: FeatureConstraints; posture?: "offline" | "server" }
  | { type: "TOGGLE_FEATURE"; tag: FeatureTag }
  | { type: "SET_FINISH_FAMILY"; family: FinishFamily }
  /** Toggle a style preset; selecting one also selects its finish family when the catalog offers it. */
  | { type: "SET_STYLE_PRESET"; preset: StylePreset; finishFamily?: FinishFamily }
  /** T-041: pick a result tab; every tab's plan is already validated, so nothing re-solves. */
  | { type: "SELECT_PRIORITY"; value: Priority }
  | { type: "SET_SPACIOUSNESS"; value: Spaciousness }
  | { type: "SET_BUDGET"; field: "bTarget" | "bMax"; value: string }
  | { type: "SET_FIXTURE_WANT"; fixture: OptionalFixture; value: boolean }
  | { type: "SET_SINK"; value: SinkChoice }
  | { type: "SET_DOOR_OFFSET"; value: string }
  | { type: "SOLVE_START"; preserveOutput?: boolean }
  | { type: "SOLVE_RESULT"; output: BuildOutput; profiles?: PriorityPlans[] }
  | { type: "SOLVE_ERROR"; message: string; preserveOutput?: boolean }
  | { type: "SET_VIEW_MODE"; value: ViewMode }
  | { type: "SELECT_RELAXATION"; index: number }
  | { type: "TRADEOFF_RESULT"; value: string[] };

function roomSnapshot(state: AppState): RoomEditSnapshot {
  const { roomSelection, room, preview, roomOpenings, roomError, screen, output, solveStatus, solveMessage, adjustments, adjustmentsDirty, adjustmentKind, selectedRelaxation, selectedRelaxationKind } = state;
  return { roomSelection, room, preview, roomOpenings, roomError, screen, output, solveStatus, solveMessage, adjustments, adjustmentsDirty, adjustmentKind, selectedRelaxation, selectedRelaxationKind };
}

export function reduceState(state: AppState, action: Action): AppState {
  let next = reduceAction(state, action);
  if (next !== state && (state.roomRevision !== undefined || state.roomAiRequest || state.roomProposal) && ["SET_ROOM_FIELD", "SET_ROOM_SHAPE", "UPDATE_OPENING", "APPLY_ROOM_DRAG", "ADD_WINDOW", "REMOVE_WINDOW", "UNDO_ROOM_EDIT", "CANCEL_ROOM_EDIT", "CONFIRM_ROOM", "EDIT_ROOM", "PREVIEW_ROOM_SUCCESS"].includes(action.type)) {
    next = { ...next, roomRevision: (state.roomRevision ?? 0) + 1, roomProposal: undefined, roomAiRequest: undefined, roomAiStatus: "idle" };
  }
  if (next !== state && state.roomEditor && ["SET_ROOM_FIELD", "SET_ROOM_SHAPE", "UPDATE_OPENING", "APPLY_ROOM_DRAG", "ADD_WINDOW", "REMOVE_WINDOW"].includes(action.type)) {
    return { ...next, roomEditor: { ...state.roomEditor, history: [...state.roomEditor.history, roomSnapshot(state)] } };
  }
  return next;
}

function reduceAction(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "ROOM_AI_TEXT":
      return { ...state, roomAiText: action.value, roomProposal: undefined, roomAiRequest: undefined, roomAiStatus: "idle", roomAiMessage: undefined, roomRevision: (state.roomRevision ?? 0) + 1 };
    case "ROOM_AI_START":
      return { ...state, roomAiStatus: "loading", roomAiRequest: action.key, roomAiMessage: undefined };
    case "ROOM_AI_RESULT":
      if (state.roomAiRequest !== action.key) return state;
      return action.key === roomProposalKey(state)
        ? { ...state, roomAiStatus: "success", roomAiRequest: undefined, roomProposal: { value: action.proposal, key: action.key, ...(action.source ? { source: action.source } : {}) }, roomAiMessage: "Review the proposed changes. Nothing has been applied." }
        : { ...state, roomAiStatus: "error", roomAiRequest: undefined, roomAiMessage: "Room changed during the request. Request a fresh proposal." };
    case "ROOM_AI_ERROR":
      return state.roomAiRequest === action.key ? { ...state, roomAiStatus: "error", roomAiRequest: undefined, roomAiMessage: action.message ?? "AI request unavailable. Existing work is unchanged; retry or edit manually." } : state;
    case "ROOM_AI_CANCEL":
      return { ...state, roomProposal: undefined, roomAiRequest: undefined, roomAiStatus: "idle", roomAiMessage: undefined, roomRevision: (state.roomRevision ?? 0) + 1 };
    case "ROOM_AI_APPLY": {
      if (!state.roomProposal || state.roomProposal.key !== roomProposalKey(state)) return state;
      const reviewed = reviewRoomProposal(state, state.roomProposal.value);
      if (!reviewed || reviewed.error) return { ...state, roomAiStatus: "error", roomAiMessage: reviewed?.error ?? "Unsupported proposal. Request a fresh edit." };
      const snapshot = roomSnapshot(state);
      const editor = state.roomEditor ?? { original: snapshot, history: [] };
      return { ...updateOpenings(state, reviewed.preview.openings), room: reviewed.room, preview: reviewed.preview, roomError: openingError(reviewed.preview), screen: "room", roomEditor: { ...editor, history: [...editor.history, snapshot] }, roomProposal: undefined, roomAiRequest: undefined, roomAiStatus: "idle", roomAiMessage: "Applied to the preview. Undo or Cancel is available; confirm the room before solving.", roomRevision: (state.roomRevision ?? 0) + 1, selectedRelaxation: undefined, selectedRelaxationKind: undefined };
    }
    case "DECOR_START":
      return { ...state, decorStatus: "loading", decorRequest: action.key };
    case "DECOR_RESULT":
      // Stale or superseded responses are dropped; only the latest keyed request lands.
      if (state.decorRequest !== action.key) return state;
      return { ...state, decor: { key: action.key, proposal: action.proposal, source: action.source }, decorStatus: "done", decorRequest: undefined };
    case "SET_PHOTO_PENDING":
      return { ...state, photoPending: action.value };
    case "SET_ROOM_FIELD": {
      const room = { ...state.room, [action.field]: action.value };
      // Live preview: re-derive the authoritative outline on every edit so the
      // drawing always reflects the typed dimensions (confirm still explicit).
      const preview = buildRoomPreview(room, state.preview?.openings ?? state.roomOpenings);
      return {
        ...state,
        room,
        preview: preview.ok ? preview.preview : state.preview ? { ...state.preview, confirmed: false } : undefined,
        roomOpenings: preview.ok ? preview.preview.openings : state.preview?.openings ?? state.roomOpenings,
        roomError: preview.ok ? openingError(preview.preview) : preview.message,
        output: undefined,
        solveStatus: "idle",
        selectedRelaxation: undefined,
        selectedRelaxationKind: undefined,
        adjustmentKind: undefined,
        adjustments: { ...state.adjustments, doorOffsetMm: preview.ok ? String(preview.preview.openings.find((opening) => opening.kind === "door")?.alongOffsetMm ?? "") : state.adjustments.doorOffsetMm },
      };
    }
    case "SET_ROOM_SHAPE": {
      const room = { ...state.room, shape: action.shape };
      const previous = state.preview?.openings ?? state.roomOpenings;
      const before = buildRoomPreview(state.room, previous);
      const after = buildRoomPreview(room, previous);
      // Wall ids re-map between shapes (a rectangle's wall-bottom is the L's notch edge),
      // so keep each opening at the same physical spot rather than the same wall id.
      const preview = before.ok && after.ok && previous
        ? { ok: true as const, preview: { ...after.preview, openings: rehomeOpenings(before.preview.polygon, after.preview.polygon, previous) } }
        : after;
      return {
        ...state,
        room,
        preview: preview.ok ? preview.preview : state.preview ? { ...state.preview, confirmed: false } : undefined,
        roomOpenings: preview.ok ? preview.preview.openings : state.preview?.openings ?? state.roomOpenings,
        roomError: preview.ok ? openingError(preview.preview) : preview.message,
        output: undefined,
        solveStatus: "idle",
        selectedRelaxation: undefined,
        selectedRelaxationKind: undefined,
        adjustmentKind: undefined,
        adjustments: { ...state.adjustments, doorOffsetMm: preview.ok ? String(preview.preview.openings.find((opening) => opening.kind === "door")?.alongOffsetMm ?? "") : state.adjustments.doorOffsetMm },
      };
    }
    case "SET_PHOTO":
      return { ...state, room: { ...state.room, photoName: action.name, photoDataUrl: action.dataUrl }, photoStatus: "idle", photoMessage: undefined };
    case "SET_PHOTO_STATUS":
      return { ...state, photoStatus: action.status, photoMessage: action.message, aiPosture: action.posture ?? state.aiPosture };
    case "PREVIEW_ROOM_SUCCESS":
      return {
        ...state,
        preview: action.preview,
        roomOpenings: action.preview.openings,
        roomError: openingError(action.preview),
        adjustments: {
          ...state.adjustments,
          doorOffsetMm: String(action.preview.openings.find((opening) => opening.kind === "door")?.alongOffsetMm ?? 0),
        },
      };
    case "PREVIEW_ROOM_ERROR":
      return { ...state, preview: state.preview ? { ...state.preview, confirmed: false } : undefined, roomError: action.message };
    case "EDIT_ROOM":
      return state.roomEditor ? state : { ...state, roomEditor: { original: roomSnapshot(state), history: [] }, roomSelection: state.preview ? { kind: "wall", id: buildWallStrips(state.preview.polygon)[0].id } : undefined, screen: "room", preview: state.preview ? { ...state.preview, confirmed: false } : undefined, output: undefined, solveStatus: "idle", selectedRelaxation: undefined, selectedRelaxationKind: undefined, adjustmentKind: undefined, adjustmentsDirty: false };
    case "SELECT_ROOM_ELEMENT": {
      if (!state.roomEditor || !state.preview) return state;
      const exists = action.selection.kind === "wall"
        ? buildWallStrips(state.preview.polygon).some((wall) => wall.id === action.selection.id)
        : state.preview.openings.some((opening) => opening.id === action.selection.id);
      return exists ? { ...state, roomSelection: action.selection } : state;
    }
    case "CANCEL_ROOM_EDIT":
      return state.roomEditor ? { ...state, ...state.roomEditor.original, roomEditor: undefined } : state;
    case "UNDO_ROOM_EDIT": {
      const previous = state.roomEditor?.history.at(-1);
      return previous && state.roomEditor ? { ...state, ...previous, roomEditor: { ...state.roomEditor, history: state.roomEditor.history.slice(0, -1) } } : state;
    }
    case "UPDATE_OPENING": {
      if (!state.roomEditor || !state.preview || !state.preview.openings.some((opening) => opening.id === action.id)) return state;
      if (![action.alongOffsetMm, action.spanMm].every(Number.isFinite)) return { ...state, roomError: "Enter finite opening dimensions in millimetres." };
      const openings = state.preview.openings.map((opening) => opening.id !== action.id ? opening : {
        ...opening, wallId: action.wallId, alongOffsetMm: action.alongOffsetMm, spanMm: action.spanMm,
        swing: opening.swing ? { ...opening.swing, leafDimsMm: { ...opening.swing.leafDimsMm, w: action.spanMm } } : undefined,
      });
      return updateOpenings(state, openings);
    }
    case "APPLY_ROOM_DRAG": {
      // One drag = one undo step; the drag module only commits candidates this rebuild accepts.
      if (!state.roomEditor || !state.preview) return state;
      const built = buildRoomPreview({ ...action.room, shape: state.room.shape }, action.openings);
      if (!built.ok) return { ...state, roomError: built.message };
      return updateOpenings({ ...state, room: { ...state.room, widthMm: action.room.widthMm, depthMm: action.room.depthMm, notchWidthMm: action.room.notchWidthMm, notchDepthMm: action.room.notchDepthMm }, preview: built.preview }, action.openings);
    }
    case "ADD_WINDOW": {
      if (!state.roomEditor || !state.preview) return state;
      // T-037: centre the new window in the largest free gap on any wall (several windows
      // per wall are fine); refuse only when no gap fits a 600 mm window.
      const gap = largestFreeGap(state.preview);
      if (!gap || gap.lengthMm < WINDOW_SPAN_MM) return { ...state, roomError: "No wall has a free 600 mm gap for another window. Move or remove an opening first." };
      let index = 1;
      while (state.preview.openings.some((opening) => opening.id === `window-${index}`)) index++;
      const alongOffsetMm = Math.round(gap.startMm + (gap.lengthMm - WINDOW_SPAN_MM) / 2);
      return { ...updateOpenings(state, [...state.preview.openings, { id: `window-${index}`, kind: "window", wallId: gap.wallId, alongOffsetMm, spanMm: WINDOW_SPAN_MM }]), roomSelection: { kind: "opening", id: `window-${index}` } };
    }
    case "REMOVE_WINDOW": {
      const opening = state.preview?.openings.find((item) => item.id === action.id && item.kind === "window");
      if (!state.roomEditor || !state.preview || !opening) return state;
      return { ...updateOpenings(state, state.preview.openings.filter((item) => item.id !== action.id)), roomSelection: { kind: "wall", id: opening.wallId } };
    }
    case "CONFIRM_ROOM": {
      if (!state.preview) return state;
      const rebuilt = buildRoomPreview(state.room, state.preview.openings);
      const error = !rebuilt.ok ? rebuilt.message : openingError(rebuilt.preview);
      return error ? { ...state, roomError: error } : { ...state, screen: "taste", preview: { ...state.preview, confirmed: true }, roomEditor: undefined, roomError: undefined };
    }
    case "SET_TASTE_TEXT":
      return { ...state, taste: { ...state.taste, text: action.value }, tasteMessage: undefined, output: undefined, solveStatus: "idle", selectedRelaxation: undefined, selectedRelaxationKind: undefined, adjustmentKind: undefined };
    case "SET_TASTE_STATUS":
      return {
        ...state,
        tasteStatus: action.status,
        tasteMessage: action.message,
        aiPosture: action.posture ?? state.aiPosture,
        taste: action.constraints ? { ...state.taste, featureConstraints: action.constraints } : state.taste,
        output: undefined,
        solveStatus: "idle",
        selectedRelaxation: undefined,
        selectedRelaxationKind: undefined,
        adjustmentKind: undefined,
      };
    case "TOGGLE_FEATURE": {
      const current = state.taste.featureConstraints.requiredFeatures;
      const requiredFeatures = current.includes(action.tag)
        ? current.filter((tag) => tag !== action.tag)
        : [...current, action.tag].sort();
      return { ...state, taste: { ...state.taste, featureConstraints: { ...state.taste.featureConstraints, requiredFeatures } }, output: undefined, solveStatus: "idle", selectedRelaxation: undefined, selectedRelaxationKind: undefined, adjustmentKind: undefined };
    }
    case "SET_STYLE_PRESET": {
      const selecting = state.taste.stylePreset !== action.preset;
      const featureConstraints = selecting && action.finishFamily
        ? { ...state.taste.featureConstraints, finishFamilies: [action.finishFamily] }
        : state.taste.featureConstraints;
      return { ...state, taste: { ...state.taste, stylePreset: selecting ? action.preset : undefined, featureConstraints }, output: undefined, solveStatus: "idle", selectedRelaxation: undefined, selectedRelaxationKind: undefined, adjustmentKind: undefined };
    }
    case "SET_FINISH_FAMILY": {
      const current = state.taste.featureConstraints.finishFamilies;
      const finishFamilies = current.includes(action.family)
        ? current.filter((family) => family !== action.family)
        : [...current, action.family].sort();
      return { ...state, taste: { ...state.taste, featureConstraints: { ...state.taste.featureConstraints, finishFamilies } }, output: undefined, solveStatus: "idle", selectedRelaxation: undefined, selectedRelaxationKind: undefined, adjustmentKind: undefined };
    }
    case "SELECT_PRIORITY":
      return { ...state, taste: { ...state.taste, priority: action.value } };
    case "SET_SPACIOUSNESS":
      return state.screen === "result"
        ? { ...state, taste: { ...state.taste, spaciousness: action.value }, adjustmentKind: state.adjustmentKind === "global" || state.adjustmentKind === "local" ? "global" : "weights", adjustmentsDirty: true }
        : { ...state, taste: { ...state.taste, spaciousness: action.value }, output: undefined, solveStatus: "idle", selectedRelaxation: undefined, selectedRelaxationKind: undefined, adjustmentKind: undefined };
    case "SET_BUDGET":
      return state.screen === "result"
        ? { ...state, taste: { ...state.taste, [action.field]: action.value }, solveMessage: undefined, adjustmentKind: "global", adjustmentsDirty: true }
        : { ...state, taste: { ...state.taste, [action.field]: action.value }, solveMessage: undefined, output: undefined, solveStatus: "idle", selectedRelaxation: undefined, selectedRelaxationKind: undefined, adjustmentKind: undefined };
    case "SET_FIXTURE_WANT":
    case "SET_SINK": {
      const fixtures: FixtureWants = action.type === "SET_SINK"
        ? { ...state.taste.fixtures, sink: action.value }
        : { ...state.taste.fixtures, [action.fixture]: action.value };
      const taste = { ...state.taste, fixtures };
      return state.output
        ? { ...state, taste, solveMessage: undefined, adjustmentKind: "global", adjustmentsDirty: true }
        : { ...state, taste, solveMessage: undefined, output: undefined, solveStatus: "idle", selectedRelaxation: undefined, selectedRelaxationKind: undefined, adjustmentKind: undefined };
    }
    case "SET_DOOR_OFFSET":
      return state.screen === "result"
        ? { ...state, adjustments: { ...state.adjustments, doorOffsetMm: action.value }, solveMessage: undefined, adjustmentKind: state.adjustmentKind === "global" ? "global" : "local", adjustmentsDirty: true }
        : { ...state, adjustments: { ...state.adjustments, doorOffsetMm: action.value }, solveMessage: undefined, output: undefined, solveStatus: "idle", selectedRelaxation: undefined, selectedRelaxationKind: undefined, adjustmentKind: undefined };
    case "SOLVE_START":
      // A fresh solve opens on the Balanced tab; a re-optimize keeps the chosen tab.
      return { ...state, taste: action.preserveOutput ? state.taste : { ...state.taste, priority: "balanced" }, solveStatus: "loading", solveMessage: undefined, output: action.preserveOutput ? state.output : undefined, selectedRelaxation: action.preserveOutput ? state.selectedRelaxation : undefined, selectedRelaxationKind: action.preserveOutput ? state.selectedRelaxationKind : undefined, tradeoffNarration: undefined };
    case "SOLVE_RESULT":
      return {
        ...state,
        screen: "result",
        solveStatus: "success",
        output: action.output,
        priorityPlans: action.profiles,
        selectedRelaxation: action.output.kind === "relaxation"
          ? Math.max(0, state.selectedRelaxationKind ? action.output.menu.findIndex((item) => item.kind === state.selectedRelaxationKind) : state.selectedRelaxation ?? 0)
          : undefined,
        selectedRelaxationKind: action.output.kind === "relaxation"
          ? action.output.menu[Math.max(0, state.selectedRelaxationKind ? action.output.menu.findIndex((item) => item.kind === state.selectedRelaxationKind) : state.selectedRelaxation ?? 0)]?.kind
          : undefined,
        solveMessage: undefined,
        tradeoffNarration: undefined,
        adjustmentsDirty: false,
        adjustmentKind: undefined,
      };
    case "SOLVE_ERROR":
      return { ...state, solveStatus: "error", solveMessage: action.message, output: action.preserveOutput ? state.output : undefined };
    case "SET_VIEW_MODE":
      return { ...state, viewMode: action.value };
    case "SELECT_RELAXATION":
      return {
        ...state,
        selectedRelaxation: action.index,
        selectedRelaxationKind: state.output?.kind === "relaxation" ? state.output.menu[action.index]?.kind : undefined,
      };
    case "TRADEOFF_RESULT":
      return { ...state, tradeoffNarration: action.value };
  }
}

export interface AppStore {
  getState(): AppState;
  dispatch(action: Action): void;
  subscribe(listener: (state: AppState) => void): () => void;
}

export function createAppStore(): AppStore {
  let state = initialState();
  const listeners = new Set<(next: AppState) => void>();
  return {
    getState: () => state,
    dispatch(action) {
      state = reduceState(state, action);
      for (const listener of listeners) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function positiveMm(value: string, label: string): { ok: true; value: number } | { ok: false; message: string } {
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) return { ok: false, message: `${label} must be a positive millimetre value.` };
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 20000) return { ok: false, message: `${label} must be between 1 and 20,000 mm.` };
  return { ok: true, value: Math.round(parsed * 10) / 10 };
}

/** Build the authoritative room input from typed fields. No AI or solver is involved. */
export function buildRoomPreview(room: RoomDraft, existingOpenings?: InputSet["openings"]): { ok: true; preview: RoomPreview } | { ok: false; message: string } {
  const width = positiveMm(room.widthMm, "Room width");
  const depth = positiveMm(room.depthMm, "Room depth");
  if (!width.ok) return width;
  if (!depth.ok) return depth;
  const notchWidth = room.shape === "l-shape" ? positiveMm(room.notchWidthMm, "L-shape cut width") : { ok: true as const, value: 0 };
  const notchDepth = room.shape === "l-shape" ? positiveMm(room.notchDepthMm, "L-shape cut depth") : { ok: true as const, value: 0 };
  if (!notchWidth.ok) return notchWidth;
  if (!notchDepth.ok) return notchDepth;
  if (room.shape === "l-shape" && (notchWidth.value >= width.value || notchDepth.value >= depth.value)) {
    return { ok: false, message: "The L-shape cut must be smaller than both room dimensions." };
  }

  const vertices = room.shape === "rectangle"
    ? [{ x: 0, y: 0 }, { x: width.value, y: 0 }, { x: width.value, y: depth.value }, { x: 0, y: depth.value }]
    : [
        { x: 0, y: 0 },
        { x: width.value, y: 0 },
        { x: width.value, y: depth.value },
        { x: notchWidth.value, y: depth.value },
        { x: notchWidth.value, y: notchDepth.value },
        { x: 0, y: notchDepth.value },
      ];
  const polygon = { vertices, ccw: true as const, wallThicknessMm: 100 };
  if (existingOpenings) return { ok: true, preview: { polygon, openings: existingOpenings, confirmed: false } };
  const doorSpan = 700;
  // Never assume a wall id: strip ids follow the engine's side-naming convention,
  // where an L-shape's long bottom-edge can be wall-top and the notch edge is
  // wall-bottom. Deterministically place the door on the longest wall that fits.
  const fitting = buildWallStrips(polygon)
    .filter((strip) => strip.usableLengthMm >= doorSpan)
    .sort((a, b) => b.usableLengthMm - a.usableLengthMm || (a.id < b.id ? -1 : 1));
  const doorWall = fitting[0];
  if (!doorWall) {
    return { ok: false, message: "No wall is at least 700 mm long for the default door opening." };
  }
  const openings: InputSet["openings"] = [{
    id: "door-1",
    wallId: doorWall.id,
    kind: "door",
    alongOffsetMm: Math.max(0, Math.min(doorWall.usableLengthMm - 850, doorWall.usableLengthMm - doorSpan)),
    spanMm: doorSpan,
    swing: { side: "in", leafDimsMm: { w: doorSpan, d: 25 } },
  }];
  return { ok: true, preview: { polygon, openings, confirmed: false } };
}

/**
 * Move openings from one room outline to another by physical position: an opening stays
 * where it was when a wall of the new outline still runs through it (clamped into that
 * wall if it now overhangs an end), otherwise it moves to the longest free wall that
 * fits it. Openings that fit nowhere keep their old placement so openingError reports them.
 */
export function rehomeOpenings(from: RoomPolygon, to: RoomPolygon, openings: InputSet["openings"]): InputSet["openings"] {
  const oldWalls = buildWallStrips(from);
  const newWalls = buildWallStrips(to);
  const placed: InputSet["openings"] = [];
  const free = (wallId: string, offset: number, span: number) =>
    !placed.some((o) => o.wallId === wallId && Math.max(o.alongOffsetMm, offset) < Math.min(o.alongOffsetMm + o.spanMm, offset + span));
  for (const opening of openings) {
    const oldWall = oldWalls.find((w) => w.id === opening.wallId);
    let moved: InputSet["openings"][number] | undefined;
    if (oldWall) {
      const start = stripPoint(oldWall, opening.alongOffsetMm);
      for (const wall of newWalls) {
        if (wall.usableLengthMm < opening.spanMm) continue;
        const dx = start.x - wall.origin.x;
        const dy = start.y - wall.origin.y;
        const along = dx * wall.direction.x + dy * wall.direction.y;
        const off = Math.abs(dx * wall.direction.y - dy * wall.direction.x);
        // Same line, and the opening overlaps the wall's extent.
        if (off > 1 || along + opening.spanMm <= 0 || along >= wall.usableLengthMm) continue;
        const offset = Math.round(Math.min(Math.max(along, 0), wall.usableLengthMm - opening.spanMm));
        if (!free(wall.id, offset, opening.spanMm)) continue;
        moved = { ...opening, wallId: wall.id, alongOffsetMm: offset };
        break;
      }
    }
    if (!moved) {
      const wall = [...newWalls]
        .sort((a, b) => b.usableLengthMm - a.usableLengthMm || (a.id < b.id ? -1 : 1))
        .find((w) => w.usableLengthMm >= opening.spanMm && free(w.id, Math.round((w.usableLengthMm - opening.spanMm) / 2), opening.spanMm));
      if (wall) moved = { ...opening, wallId: wall.id, alongOffsetMm: Math.round((wall.usableLengthMm - opening.spanMm) / 2) };
    }
    placed.push(moved ?? opening);
  }
  return placed;
}

const WINDOW_SPAN_MM = 600;

/** Largest opening-free stretch across all walls (longest first, then wall order). */
function largestFreeGap(preview: RoomPreview): { wallId: string; startMm: number; lengthMm: number } | undefined {
  let best: { wallId: string; startMm: number; lengthMm: number } | undefined;
  for (const wall of buildWallStrips(preview.polygon)) {
    const taken = preview.openings
      .filter((o) => o.wallId === wall.id)
      .map((o) => [o.alongOffsetMm, o.alongOffsetMm + o.spanMm] as const)
      .sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [start, end] of [...taken, [wall.usableLengthMm, wall.usableLengthMm] as const]) {
      const lengthMm = start - cursor;
      if (!best || lengthMm > best.lengthMm) best = { wallId: wall.id, startMm: cursor, lengthMm };
      cursor = Math.max(cursor, end);
    }
  }
  return best;
}

export function openingError(preview: RoomPreview): string | undefined {
  const walls = buildWallStrips(preview.polygon);
  for (const opening of preview.openings) {
    const wall = walls.find((strip) => strip.id === opening.wallId);
    if (!wall || !Number.isFinite(opening.alongOffsetMm) || !Number.isFinite(opening.spanMm) || opening.alongOffsetMm < 0 || opening.spanMm <= 0 || opening.alongOffsetMm + opening.spanMm > wall.usableLengthMm) {
      return `${opening.id} does not fit its wall. Choose a wall and keep the offset plus span within its length.`;
    }
    if (preview.openings.some((other) => other.id !== opening.id && other.wallId === opening.wallId && Math.max(other.alongOffsetMm, opening.alongOffsetMm) < Math.min(other.alongOffsetMm + other.spanMm, opening.alongOffsetMm + opening.spanMm))) {
      return `${opening.id} overlaps another opening. Move or resize it before confirming.`;
    }
  }
  return undefined;
}

function updateOpenings(state: AppState, openings: InputSet["openings"]): AppState {
  const preview = { ...state.preview!, openings, confirmed: false };
  return { ...state, preview, roomOpenings: openings, roomError: openingError(preview), output: undefined, solveStatus: "idle", adjustmentsDirty: false, adjustmentKind: undefined,
    adjustments: { ...state.adjustments, doorOffsetMm: String(openings.find((opening) => opening.kind === "door")?.alongOffsetMm ?? "") } };
}

function nonEmpty<T extends string>(values: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is T => typeof value === "string" && allowed.includes(value as T)))].sort();
}

export function normalizeFeatureConstraints(raw: unknown): FeatureConstraints | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const requiredFeatures = nonEmpty(record.requiredFeatures, FEATURE_TAGS);
  const finishFamilies = nonEmpty(record.finishFamilies, FINISH_FAMILIES);
  const preferredClasses = nonEmpty(record.preferredClasses, FIXTURE_CLASSES);
  const hasSignal = requiredFeatures.length > 0 || finishFamilies.length > 0 || preferredClasses.length > 0;
  if (!hasSignal) return null;
  return { requiredFeatures, finishFamilies, preferredClasses, classCountRanges: {} };
}

const FEATURE_PATTERNS: ReadonlyArray<readonly [RegExp, FeatureTag]> = [
  [/\brain\b/, "rain_shower"], [/\bthermostat(ic)?\b/, "thermostatic"], [/\bsmart\b/, "smart"],
  [/\bbidet\b/, "bidet"], [/\bheated\b/, "heated_seat"], [/\bdual[- ]?flush\b/, "dual_flush"],
  [/\blow[- ]?flow\b|\beco\b|\bwater[- ]?sav(er|ing)\b/, "low_flow"], [/\bsingle[- ]?lever\b/, "single_lever"],
  [/\bcomfort[- ]?height\b/, "comfort_height"], [/\belongated\b/, "elongated"], [/\bsoft[- ]?clos/, "soft_close"],
];
const FINISH_PATTERNS: ReadonlyArray<readonly [RegExp, FinishFamily]> = [
  [/\bmatte[- ]?black\b/, "matte_black"], [/\bbrushed[- ]?nickel\b/, "brushed_nickel"],
  [/\bgold\b|\bbrass\b/, "brushed_gold"], [/\bchrome\b|\bpolished\b|\bsilver\b/, "chrome"],
  [/\bstone\b|\bmarble\b/, "stone"], [/\bwhite\b/, "white"],
];
const CLASS_PATTERNS: ReadonlyArray<readonly [RegExp, FixtureClass]> = [
  [/\btoilet\b|\bwc\b/, "toilet"], [/\bbasin\b|\bsink\b/, "basin"], [/\bfaucet\b|\btap\b/, "faucet"],
  [/\bshower\b/, "shower"], [/\btub\b|\bbath\b/, "tub"], [/\bvanit(y|ies)\b/, "vanity"], [/\bmirror\b|\btowel\b/, "accessory"],
];

function collectMatches<T extends string>(text: string, patterns: ReadonlyArray<readonly [RegExp, T]>): T[] {
  const lower = text.toLowerCase();
  return [...new Set(patterns.filter(([pattern]) => pattern.test(lower)).map(([, value]) => value))].sort();
}

export function offlineTasteToFeatures(text: string): FeatureConstraints | null {
  return normalizeFeatureConstraints({
    requiredFeatures: collectMatches(text, FEATURE_PATTERNS),
    finishFamilies: collectMatches(text, FINISH_PATTERNS),
    preferredClasses: collectMatches(text, CLASS_PATTERNS),
  });
}

export interface AiResolution {
  constraints: FeatureConstraints;
  posture: "offline" | "server";
  message: string;
}

export async function resolveTaste(text: string): Promise<AiResolution> {
  const offline = offlineTasteToFeatures(text) ?? EMPTY_FEATURE_CONSTRAINTS;
  if (!text.trim()) return { constraints: offline, posture: "offline", message: "No style cues yet — the engine will use balanced defaults." };
  try {
    const response = await fetch("/api/nim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: "taste", text: text.slice(0, 4000) }),
      signal: AbortSignal.timeout(1400),
    });
    if (response.ok) {
      const body = await response.json() as { fallback?: boolean; featureConstraints?: unknown };
      const constraints = normalizeFeatureConstraints(body.featureConstraints);
      if (constraints) {
        return body.fallback
          ? { constraints, posture: "offline", message: "Offline fallback mapped your words to closed feature controls." }
          : { constraints, posture: "server", message: "Taste mapped by the AI adapter, then constrained to catalog vocabulary." };
      }
    }
  } catch {
    // Offline-first behavior: the local closed-vocabulary twin is the expected path.
  }
  return { constraints: offline, posture: "offline", message: "Offline fallback mapped your words to closed feature controls." };
}

function budgetValue(value: string, label: string): { ok: true; value: number } | { ok: false; message: string } {
  if (!/^\d+$/.test(value.trim())) return { ok: false, message: `${label} must be a whole INR amount.` };
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return { ok: false, message: `${label} must be at least ₹1.` };
  return { ok: true, value: parsed };
}

export function buildConfirmedInput(state: AppState): { ok: true; input: InputSet } | { ok: false; message: string } {
  if (!state.preview?.confirmed) return { ok: false, message: "Confirm the room preview before generating a plan." };
  const target = budgetValue(state.taste.bTarget, "Target budget");
  const maximum = budgetValue(state.taste.bMax, "Maximum budget");
  if (!target.ok) return target;
  if (!maximum.ok) return maximum;
  if (target.value > maximum.value) return { ok: false, message: "Target budget cannot exceed the maximum budget." };
  const wants = state.taste.fixtures;
  if (!wants.shower && !wants.tub) return { ok: false, message: "Choose a shower, a tub, or both." };
  const include = { min: 1, max: 1 };
  const exclude = { min: 0, max: 0 };
  const sink: FeatureConstraints["classCountRanges"] = wants.sink === "vanity"
    ? { vanity: include, basin: exclude }
    : wants.sink === "basin" ? { basin: include, vanity: exclude } : {};
  const baseConstraints: FeatureConstraints = {
    ...state.taste.featureConstraints,
    classCountRanges: {
      ...state.taste.featureConstraints.classCountRanges,
      toilet: include,
      shower: wants.shower ? include : exclude,
      tub: wants.tub ? include : exclude,
      accessory: wants.accessory ? include : exclude,
      ...sink,
    },
  };
  // A chosen style steers product forms (vessel basin, wall-hung WC…) as a preference.
  const featureConstraints: FeatureConstraints = state.taste.stylePreset
    ? { ...baseConstraints, preferredTypes: STYLES[state.taste.stylePreset].products }
    : baseConstraints;
  const doorOffset = Number(state.adjustments.doorOffsetMm);
  const wallLengths = new Map(
    buildWallStrips(state.preview.polygon).map((strip) => [strip.id, strip.usableLengthMm]),
  );
  const adjustedDoorId = state.preview.openings.find((opening) => opening.kind === "door")?.id;
  const openings = state.preview.openings.map((opening) => {
    if (opening.id !== adjustedDoorId) return opening;
    const wallLength = wallLengths.get(opening.wallId);
    // Slider edits may carry a stale offset (e.g. after re-previewing a smaller
    // room). Clamp into the wall instead of failing the whole brief; an invalid
    // slider value must never block generation.
    const max = wallLength !== undefined ? Math.max(0, wallLength - opening.spanMm) : opening.alongOffsetMm;
    const requested = Number.isFinite(doorOffset) && doorOffset >= 0 ? doorOffset : opening.alongOffsetMm;
    return { ...opening, alongOffsetMm: Math.min(requested, max) };
  });
  for (const opening of openings) {
    if (opening.kind !== "door") continue;
    const wallLength = wallLengths.get(opening.wallId);
    if (wallLength === undefined || opening.spanMm > wallLength) {
      return { ok: false, message: "The door does not fit on its wall segment. Reduce the door span or enlarge the room." };
    }
  }
  return {
    ok: true,
    input: {
      polygon: state.preview.polygon,
      openings,
      confirmed: true,
      featureConstraints,
      priority: state.taste.priority,
      spaciousness: state.taste.spaciousness,
      budget: { bTarget: target.value, bMax: maximum.value },
      config: DEFAULT_CONFIG,
    },
  };
}

function basePlan(state: AppState): Plan | null {
  const output = state.output;
  if (!output) return null;
  if (output.kind === "plan") return output.plan;
  if (output.kind === "relaxation") return output.menu[state.selectedRelaxation ?? 0]?.plan ?? null;
  return null;
}

function optionIndex(state: AppState): number {
  return state.output?.kind === "relaxation" ? state.selectedRelaxation ?? 0 : 0;
}

export function selectedPlan(state: AppState): Plan | null {
  const base = basePlan(state);
  if (!base) return null;
  return state.priorityPlans?.[optionIndex(state)]?.[state.taste.priority] ?? base;
}

/** T-041: the result tabs for the current plan or recovery option. `sameAs` names the
 *  first earlier tab that picked the same products. */
export function priorityTabs(state: AppState): { priority: Priority; plan: Plan; sameAs?: Priority }[] {
  if (!basePlan(state)) return [];
  const plans = state.priorityPlans?.[optionIndex(state)];
  if (!plans) return [];
  const tabs: { priority: Priority; plan: Plan; sameAs?: Priority }[] = [];
  for (const priority of PRIORITY_TABS) {
    const plan = plans[priority];
    if (!plan) continue;
    const first = tabs.find((t) => t.plan.selectedCandidate.id === plan.selectedCandidate.id);
    tabs.push({ priority, plan, ...(first ? { sameAs: first.sameAs ?? first.priority } : {}) });
  }
  return tabs;
}

/** Every priority's plan for each plan / recovery option of an output, re-scored from the
 *  same cached candidate set (T-041). */
function profilesFor(output: BuildOutput, input: InputSet, catalog: CatalogState): PriorityPlans[] | undefined {
  const options = output.kind === "plan"
    ? [{ plan: output.plan, input }]
    : output.kind === "relaxation" ? output.menu.map((item) => ({ plan: item.plan, input: item.input ?? input })) : [];
  if (options.length === 0) return undefined;
  return options.map(({ plan, input: optionInput }) => {
    const plans: PriorityPlans = { [optionInput.priority ?? DEFAULT_PRIORITY]: plan };
    for (const alt of alternativeProfiles(optionInput, catalog)) plans[alt.profile] = alt.plan;
    return plans;
  });
}

export function solveConfirmed(state: AppState, catalog: CatalogState): { ok: true; output: BuildOutput; profiles?: PriorityPlans[] } | { ok: false; message: string } {
  const input = buildConfirmedInput(state);
  if (!input.ok) return input;
  try {
    const output = solve(input.input, catalog);
    return { ok: true, output, profiles: profilesFor(output, input.input, catalog) };
  } catch {
    return { ok: false, message: "The deterministic engine could not process this brief. Check the room and budget values." };
  }
}

export function reoptimizeConfirmed(
  state: AppState,
  catalog: CatalogState,
  change: ReoptChange,
): { ok: true; output: BuildOutput; profiles?: PriorityPlans[] } | { ok: false; message: string } {
  const input = buildConfirmedInput(state);
  const previous = selectedPlan(state);
  if (!input.ok) return input;
  if (!previous) return { ok: false, message: "Choose a validated plan before adjusting the brief." };
  try {
    const output = reoptimize(previous, change, input.input, catalog);
    return { ok: true, output, profiles: profilesFor(output, input.input, catalog) };
  } catch {
    return { ok: false, message: "This adjustment could not produce a validated result. Try a smaller change." };
  }
}
