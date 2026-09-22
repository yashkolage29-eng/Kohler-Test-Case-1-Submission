// T-015 DOM mount: wire a canvas to a WebGLRenderer + OrbitControls over the built
// scene. The only DOM/touch point of the 3D renderer; scene construction stays pure
// (ADR-016 render caching belongs to T-017, which owns the 2D/3D toggle).
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { DecorStyle, DecorType, PlacedDecor, RenderGeometry, SKU, StylePreset } from "@kolher/engine";
import { WALL_HEIGHT_MM, buildSceneSpec, type SceneSpec } from "./sceneSpec.js";
import { addCeilingLamp, addLights, buildPlacedDecor, buildSceneGroup, defaultCameraPosition, lookAtPoint } from "./build3d.js";
import { applyCutaway, buildArchitecture, buildSupports, type RoomStyle } from "./room3d.js";

/** A named camera preset: overview orbit or an eye-level view facing one wall's fixtures. */
export interface CameraView {
  label: string;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fov: number;
}

const EYE_MM = 1550;
const WALL_NAMES = new Map([[0, "back"], [180, "front"], [90, "left"], [-90, "right"]]);

/** Overview + one eye-level view per wall that carries fixtures, standing near the opposite wall. */
export function cameraViews(spec: SceneSpec): CameraView[] {
  const views: CameraView[] = [{ label: "Overview", position: defaultCameraPosition(spec), target: lookAtPoint(spec), fov: 45 }];
  const floor = spec.parts.find((p) => p.part === "floor");
  if (!floor || floor.shape.shape !== "box") return views;
  const half = { x: floor.shape.sizeMm.w / 2, z: floor.shape.sizeMm.d / 2 };
  const min = { x: floor.positionMm.x - half.x, z: floor.positionMm.z - half.z };
  const max = { x: floor.positionMm.x + half.x, z: floor.positionMm.z + half.z };
  const byWall = new Map<number, typeof spec.parts>();
  for (const part of spec.parts) {
    if (part.fixtureClass === "room") continue;
    const key = Math.round((part.rotationY * 180) / Math.PI);
    byWall.set(key, [...(byWall.get(key) ?? []), part]);
  }
  for (const [deg, parts] of [...byWall.entries()].sort((a, b) => a[0] - b[0])) {
    const cx = parts.reduce((sum, p) => sum + p.positionMm.x, 0) / parts.length;
    const cz = parts.reduce((sum, p) => sum + p.positionMm.z, 0) / parts.length;
    const inward = { x: Math.sin((deg * Math.PI) / 180), z: Math.cos((deg * Math.PI) / 180) };
    // Walk into the room until 250 mm short of the opposite wall.
    const reach = Math.min(
      inward.x > 0.5 ? max.x - cx : inward.x < -0.5 ? cx - min.x : Infinity,
      inward.z > 0.5 ? max.z - cz : inward.z < -0.5 ? cz - min.z : Infinity,
    ) - 250;
    const classes = [...new Set(parts.map((p) => p.fixtureClass))].filter((c) => c !== "faucet" && c !== "accessory");
    if (!classes.length) continue; // a wall with only small accessories is not worth a view
    // Stand on the room's centre line (not the fixtures' centroid) so side walls frame the view.
    const along = Math.abs(inward.x) > 0.5 ? { x: 0, z: floor.positionMm.z - cz } : { x: floor.positionMm.x - cx, z: 0 };
    views.push({
      label: `Eye level · ${WALL_NAMES.get(deg) ?? "side"} wall${classes.length ? ` (${classes.join(", ")})` : ""}`,
      position: { x: cx + along.x + inward.x * Math.max(reach, 600), y: EYE_MM, z: cz + along.z + inward.z * Math.max(reach, 600) },
      target: { x: cx, y: 950, z: cz },
      fov: 68,
    });
  }
  return views;
}

let lastViewLabel = "Overview";

type ModelChoice = Partial<Record<StylePreset | "default", string>>;
/** Bundled CC0 décor models (public/models, see ASSETS.md) per type, varied by style preset.
 *  Types or styles without an entry keep their procedural mesh. */
const DECOR_MODELS: Partial<Record<DecorType, ModelChoice>> = {
  plant: { default: "plant-floor", "japanese-zen": "plant-bonsai", japandi: "plant-calathea", scandinavian: "plant-calathea", "minimalist-modern": "plant-fern", "japanese-brutalism": "plant-fern", "industrial-loft": "plant-anthurium", coastal: "plant-anthurium", "dark-luxury": "plant-fern" },
  "small-plant": { default: "plant-small" },
  pendant: { "minimalist-modern": "pendant-modern", scandinavian: "pendant-modern", japandi: "pendant-modern", coastal: "pendant-modern", "japanese-zen": "pendant-lantern", "industrial-loft": "pendant-industrial", "japanese-brutalism": "pendant-industrial", "dark-luxury": "pendant-industrial" },
  chandelier: { default: "chandelier" },
  lantern: { default: "lantern-wood", "industrial-loft": "lantern-metal", coastal: "lantern-metal" },
  sconce: { "industrial-loft": "sconce-industrial", "dark-luxury": "sconce-industrial" },
  mirror: { "classic-luxury": "mirror-ornate" },
  art: { default: "art-photo", "classic-luxury": "art-classic", "japanese-zen": "art-round", "minimalist-modern": "art-modern", scandinavian: "art-modern", japandi: "art-modern", "dark-luxury": "art-modern" },
  vase: { default: "vase-white", "classic-luxury": "vase-brass", coastal: "vase-blue", "japanese-brutalism": "vase-jug", japandi: "vase-urn", "dark-luxury": "vase-brass" },
  stool: { default: "stool-rustic", "japanese-zen": "stool-chinese", "industrial-loft": "stool-metal", coastal: "stool-painted", scandinavian: "stool-painted" },
  bench: { default: "bench" },
  basket: { default: "basket" },
  bowl: { default: "bowl-wood" },
};

/** T-034: light models for custom tastes (no preset), chosen by the décor metal so a
 *  typed "industrial black" brief does not fall back to the plain procedural lamp. */
const METAL_LIGHT_MODELS: Partial<Record<DecorType, Partial<Record<DecorStyle["metal"], string>>>> = {
  pendant: { black: "pendant-industrial", brass: "pendant-lantern", chrome: "pendant-modern", nickel: "pendant-modern" },
  sconce: { black: "sconce-industrial" },
};

export function decorModelUrl(type: DecorType, preset?: StylePreset, metal?: DecorStyle["metal"]): string | undefined {
  const choice = DECOR_MODELS[type];
  const byMetal = preset === undefined && metal !== undefined ? METAL_LIGHT_MODELS[type]?.[metal] : undefined;
  const name = (preset && choice?.[preset]) ?? byMetal ?? choice?.default;
  return name ? `/models/${name}.glb` : undefined;
}
const modelCache = new Map<string, Promise<THREE.Object3D | null>>();

function loadModel(url: string): Promise<THREE.Object3D | null> {
  let pending = modelCache.get(url);
  if (!pending) {
    pending = new GLTFLoader().loadAsync(url).then((gltf) => gltf.scene, () => null);
    modelCache.set(url, pending);
  }
  return pending;
}

/** Swap procedural décor for the bundled CC0 models, fitted into each item's box. Wall
 *  pieces fit width × height (depth may exceed the thin box); ceiling pieces hang from the
 *  ceiling and may use the empty drop above their box; the procedural lights stay. */
function upgradeDecor(decorGroup: THREE.Group, decor: PlacedDecor[], style: RoomStyle | undefined, ceilingMm: number, redraw: () => void): void {
  for (const item of decor) {
    const url = decorModelUrl(item.type, style?.preset, style?.metal);
    const group = decorGroup.children.find((child) => child.userData.decorId === item.id);
    if (!url || !group) continue;
    void loadModel(url).then((model) => {
      if (!model || !group.parent) return;
      const clone = model.clone(true);
      const box = new THREE.Box3().setFromObject(clone);
      const size = box.getSize(new THREE.Vector3());
      const { w, h, d } = item.sizeMm;
      const top = ceilingMm - item.positionMm.y; // local y of the ceiling
      const scale = item.mount === "wall" ? Math.min(w / size.x, h / size.y, (d * 2.5) / size.z)
        : item.mount === "ceiling" ? Math.min(w / size.x, d / size.z, (top + h / 2) / size.y)
          : Math.min(w / size.x, h / size.y, d / size.z);
      clone.scale.setScalar(scale);
      const center = box.getCenter(new THREE.Vector3());
      const y = item.mount === "ceiling" ? top - box.max.y * scale : -h / 2 - box.min.y * scale;
      // Wall pieces sit with their back on the wall (box back = local -d/2).
      const z = item.mount === "wall" ? -d / 2 - box.min.z * scale : -center.z * scale;
      clone.position.set(-center.x * scale, y, z);
      clone.traverse((child) => { child.castShadow = true; child.receiveShadow = true; child.userData.decorId = item.id; });
      for (const child of [...group.children]) if (child instanceof THREE.Mesh) group.remove(child);
      group.add(clone);
      redraw();
    });
  }
}

const REVEAL_STAGGER_MS = 80;
const REVEAL_ITEM_MS = 350;

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

/** Render the geometry (plus optional AI décor) into a canvas. Deterministic for fixed
 *  inputs. With `reveal`, décor stages in once (skipped under prefers-reduced-motion).
 *  Returns a dispose function; call it before re-rendering to free the WebGL context. */
export function mountRender3d(canvas: HTMLCanvasElement, geometry: RenderGeometry, skus: SKU[], decor?: PlacedDecor[], opts?: { reveal?: boolean; style?: RoomStyle; viewSelect?: HTMLSelectElement | null }): () => void {
  const spec = buildSceneSpec(geometry, skus);
  const scene = new THREE.Scene();
  scene.background = skyBackground();
  let redraw = (): void => undefined;
  scene.add(buildSceneGroup(spec, { style: opts?.style, onTextureLoad: () => redraw() }));
  scene.add(buildArchitecture(spec));
  scene.add(buildSupports(spec));
  const decorGroup = decor?.length ? buildPlacedDecor(decor) : undefined;
  if (decorGroup) scene.add(decorGroup);
  addLights(scene);
  // An AI pendant replaces the default ceiling lamp rather than doubling up at the centre.
  if (!decor?.some((item) => item.type === "pendant" || item.type === "chandelier")) addCeilingLamp(scene, spec);

  const views = cameraViews(spec);
  const initial = views.find((view) => view.label === lastViewLabel) ?? views[0];
  const camera = new THREE.PerspectiveCamera(initial.fov, canvas.width / canvas.height, 10, 200000);
  const pos = initial.position;
  const look = initial.target;
  camera.position.set(pos.x, pos.y, pos.z);
  camera.lookAt(look.x, look.y, look.z);

  // preserveDrawingBuffer keeps the last frame readable for the PNG export (toDataURL).
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Soft studio reflections for ceramic, chrome and glass (generated, no asset).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.45;

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(look.x, look.y, look.z);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 200;
  controls.maxDistance = 20000;
  controls.maxPolarAngle = Math.PI / 2 + 0.1;
  controls.update();
  const draw = (): void => {
    applyCutaway(scene, camera.position);
    renderer.render(scene, camera);
  };
  redraw = draw;
  controls.addEventListener("change", draw);
  const select = opts?.viewSelect;
  if (select) {
    select.innerHTML = views.map((view, i) => `<option value="${i}" ${view === initial ? "selected" : ""}>${view.label}</option>`).join("");
    select.onchange = () => {
      const view = views[Number(select.value)];
      if (!view) return;
      lastViewLabel = view.label;
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
      camera.position.set(view.position.x, view.position.y, view.position.z);
      controls.target.set(view.target.x, view.target.y, view.target.z);
      controls.update();
      draw();
    };
  }
  if (decorGroup && decor) upgradeDecor(decorGroup, decor, opts?.style, WALL_HEIGHT_MM, () => redraw());

  let frame = 0;
  const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (decorGroup && opts?.reveal && !reducedMotion) {
    const items = decorGroup.children;
    const lights: THREE.PointLight[] = [];
    decorGroup.traverse((child) => { if (child instanceof THREE.PointLight) lights.push(child); });
    for (const item of items) item.scale.setScalar(0.001);
    for (const light of lights) light.intensity = 0;
    const start = performance.now();
    const total = (items.length - 1) * REVEAL_STAGGER_MS + REVEAL_ITEM_MS;
    const step = (now: number): void => {
      const elapsed = now - start;
      items.forEach((item, i) => {
        const t = Math.min(1, Math.max(0, (elapsed - i * REVEAL_STAGGER_MS) / REVEAL_ITEM_MS));
        item.scale.setScalar(Math.max(0.001, easeOutBack(t)));
      });
      const fade = Math.min(1, elapsed / total);
      for (const light of lights) light.intensity = (light.userData.targetIntensity as number) * (1 - (1 - fade) ** 3);
      draw();
      frame = elapsed < total ? requestAnimationFrame(step) : 0;
    };
    frame = requestAnimationFrame(step);
  }
  draw();

  return () => {
    redraw = () => undefined;
    if (frame) cancelAnimationFrame(frame);
    if (select) select.onchange = null;
    envMap.dispose();
    pmrem.dispose();
    controls.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
}

/** Pale sky over warm ground: what the windows look out on, and the overview backdrop. */
function skyBackground(): THREE.Texture | THREE.Color {
  if (typeof document === "undefined") return new THREE.Color(0xf0ebe3);
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Color(0xf0ebe3);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#cfdfeb");
  g.addColorStop(0.55, "#eef2f2");
  g.addColorStop(1, "#efe9df");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
