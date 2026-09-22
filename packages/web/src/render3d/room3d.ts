// T-026c room dressing: surface materials (procedural white marble floor, painted walls,
// bundled CC0 wood), fixture detail materials, and architecture (baseboards, window and
// door framing). Presentation only; all positions derive from the SceneSpec.
import * as THREE from "three";
import { COUNTER_HEIGHT_MM, STYLES, type DecorStyle, type FloorMaterial, type StylePreset, type WallMaterial } from "@kolher/engine";
import { basinDeckMm, type DetailMaterials } from "./detail.js";
import type { OpeningSpec, PartSpec, SceneSpec } from "./sceneSpec.js";

/** Optional style from the décor proposal; everything has a neutral default. */
export type RoomStyle = Partial<Pick<DecorStyle, "palette" | "metal" | "preset">>;

/** Bundled CC0 surface textures (public/textures) with their real-world tile size and a
 *  flat colour shown until (or if never) the file loads. Marble and paint stay procedural. */
const SURFACE_TEXTURES: Record<Exclude<FloorMaterial, "marble"> | Exclude<WallMaterial, "paint">, { file: string; tileMm: number; fallback: string; roughness: number }> = {
  microcement: { file: "floor-microcement.jpg", tileMm: 3200, fallback: "#b9b6b0", roughness: 0.55 },
  hinoki: { file: "floor-hinoki.jpg", tileMm: 1890, fallback: "#d8b98f", roughness: 0.6 },
  oak: { file: "floor-oak.jpg", tileMm: 1200, fallback: "#b88a5a", roughness: 0.55 },
  "white-oak": { file: "floor-white-oak.jpg", tileMm: 1800, fallback: "#d9cdbb", roughness: 0.6 },
  herringbone: { file: "floor-herringbone.jpg", tileMm: 3400, fallback: "#a8703f", roughness: 0.5 },
  granite: { file: "floor-granite.jpg", tileMm: 2300, fallback: "#55575a", roughness: 0.45 },
  concrete: { file: "wall-concrete.jpg", tileMm: 2300, fallback: "#b4b4b0", roughness: 0.9 },
  plaster: { file: "wall-plaster.jpg", tileMm: 3000, fallback: "#a08c74", roughness: 0.95 },
  limewash: { file: "wall-limewash.jpg", tileMm: 2000, fallback: "#e9e5de", roughness: 0.95 },
  brick: { file: "wall-brick.jpg", tileMm: 1400, fallback: "#9c5a44", roughness: 0.9 },
  tile: { file: "wall-tile.jpg", tileMm: 1270, fallback: "#f1efe9", roughness: 0.25 },
};

const surfaceCache = new Map<string, Promise<THREE.Texture | null>>();
function loadSurface(file: string): Promise<THREE.Texture | null> {
  let pending = surfaceCache.get(file);
  if (!pending) {
    textureLoader ??= new THREE.TextureLoader();
    pending = textureLoader.loadAsync(`/textures/${file}`).then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 8;
      return texture;
    }, () => null);
    surfaceCache.set(file, pending);
  }
  return pending;
}

/** Flat fallback now, bundled texture (tiled at its physical size over a u × v mm face) once loaded. */
function applySurface(material: THREE.MeshPhysicalMaterial, key: keyof typeof SURFACE_TEXTURES, uMm: number, vMm: number, onLoad: () => void): void {
  const surface = SURFACE_TEXTURES[key];
  material.color.set(surface.fallback);
  material.roughness = surface.roughness;
  material.clearcoat = 0;
  if (typeof document === "undefined") return;
  void loadSurface(surface.file).then((texture) => {
    if (!texture) return;
    const map = texture.clone();
    map.repeat.set(uMm / surface.tileMm, vMm / surface.tileMm);
    material.map = map;
    material.color.set("#ffffff");
    material.needsUpdate = true;
    onLoad();
  });
}

const FINISH_PROPS: Record<string, { roughness: number; metalness: number }> = {
  chrome: { roughness: 0.06, metalness: 1 },
  brushed_nickel: { roughness: 0.28, metalness: 1 },
  matte_black: { roughness: 0.55, metalness: 0.2 },
  brushed_gold: { roughness: 0.25, metalness: 1 },
  vibrant_brushed_moderne_brass: { roughness: 0.25, metalness: 1 },
  vibrant_french_gold: { roughness: 0.2, metalness: 1 },
};

const DEFAULT_WALL = "#cdc5b8";

/** Deterministic PRNG (mulberry32) so the procedural marble is identical every build. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Floor texture covering 1200 × 1200 mm: white marble planks (600 × 1200, running bond). */
export function marbleFloorTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const rand = rng(7);
  ctx.fillStyle = "#eceeef";
  ctx.fillRect(0, 0, size, size);
  // Soft cloudy base.
  for (let i = 0; i < 60; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 60 + rand() * 180;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(205,210,214,${0.12 + rand() * 0.12})`);
    g.addColorStop(1, "rgba(205,210,214,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Veins: meandering diagonal strokes, a few bold, many faint.
  for (let i = 0; i < 26; i++) {
    const bold = i < 7;
    ctx.strokeStyle = bold ? `rgba(120,128,134,${0.35 + rand() * 0.25})` : `rgba(150,158,164,${0.12 + rand() * 0.18})`;
    ctx.lineWidth = bold ? 1.4 + rand() * 2 : 0.6 + rand();
    ctx.beginPath();
    let x = rand() * size;
    let y = rand() * size;
    const angle = -0.7 + rand() * 0.5;
    ctx.moveTo(x, y);
    for (let s = 0; s < 40; s++) {
      x += Math.cos(angle) * 22 + (rand() - 0.5) * 26;
      y += Math.sin(angle) * 22 + (rand() - 0.5) * 26;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Grout: two 600 mm columns, planks 1200 mm long, second column offset 600 mm.
  ctx.strokeStyle = "rgba(170,172,170,0.9)";
  ctx.lineWidth = 3;
  const half = size / 2;
  ctx.beginPath();
  ctx.moveTo(half, 0); ctx.lineTo(half, size);
  ctx.moveTo(0, 0); ctx.lineTo(half, 0);
  ctx.moveTo(half, half); ctx.lineTo(size, half);
  ctx.moveTo(0, 0); ctx.lineTo(0, size);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Faint painted-plaster variation so walls are not a flat fill. */
function wallTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const rand = rng(11);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const v = 236 + Math.floor(rand() * 16);
    ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
    ctx.fillRect(rand() * 256, rand() * 256, 2 + rand() * 4, 2 + rand() * 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const lightnessOf = (color: THREE.Color): number => color.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).l;

/** T-039: a palette whose mean lightness is low asks for a dark room. */
function isDarkPalette(palette: string[]): boolean {
  return palette.length > 0 && palette.reduce((sum, hex) => sum + lightnessOf(new THREE.Color(hex)), 0) / palette.length < 0.35;
}

/** Wall paint: the lightest palette colour pulled toward a warm greige; a dark palette
 *  paints graphite instead (its darkest colour, lifted slightly toward the greige). */
export function wallHex(style?: RoomStyle): string {
  const palette = style?.palette ?? [];
  if (!palette.length) return DEFAULT_WALL;
  const byLightness = palette.map((hex) => new THREE.Color(hex)).sort((a, b) => lightnessOf(b) - lightnessOf(a));
  if (isDarkPalette(palette)) return `#${byLightness[byLightness.length - 1].lerp(new THREE.Color(DEFAULT_WALL), 0.06).getHexString()}`;
  return `#${new THREE.Color(DEFAULT_WALL).lerp(byLightness[0], 0.25).getHexString()}`;
}

let textureLoader: THREE.TextureLoader | undefined;

/** Bundled wood texture; the material keeps its flat colour if the file cannot load. */
function woodMaterial(file: "wood-oak.jpg" | "wood-walnut.jpg", fallback: string, onLoad: () => void): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: fallback, roughness: 0.55, metalness: 0 });
  if (typeof document === "undefined") return material;
  textureLoader ??= new THREE.TextureLoader();
  textureLoader.load(`/textures/${file}`, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1 / 700, 1 / 700);
    material.map = texture;
    material.color.set("#ffffff");
    material.needsUpdate = true;
    onLoad();
  }, undefined, () => undefined);
  return material;
}

/** Box-projected UVs in mm so textures keep a physical scale on any detail geometry. */
function worldScaleUv(geometry: THREE.BufferGeometry): void {
  const pos = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  if (!pos || !normal) return;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    const [u, v] = nx >= ny && nx >= nz ? [pos.getZ(i), pos.getY(i)] : ny >= nz ? [pos.getX(i), pos.getZ(i)] : [pos.getX(i), pos.getY(i)];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/** Detail materials shared across one scene. `onTextureLoad` redraws once a texture arrives. */
export function detailMaterials(finishHexById: (id: string | undefined) => string, onTextureLoad: () => void): DetailMaterials & { prepareWood: (root: THREE.Object3D) => void } {
  const ceramic = new THREE.MeshPhysicalMaterial({ color: "#f7f7f5", roughness: 0.14, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 });
  const oak = woodMaterial("wood-oak.jpg", "#b88a5a", onTextureLoad);
  const walnut = woodMaterial("wood-walnut.jpg", "#6b4a33", onTextureLoad);
  const metals = new Map<string, THREE.Material>();
  const metal = (part: PartSpec): THREE.Material => {
    const id = part.finishId ?? "chrome";
    let m = metals.get(id);
    if (!m) {
      const props = FINISH_PROPS[id] ?? FINISH_PROPS.chrome;
      m = new THREE.MeshStandardMaterial({ color: finishHexById(id), roughness: props.roughness, metalness: props.metalness });
      metals.set(id, m);
    }
    return m;
  };
  // Dark catalog finishes read as walnut, light ones as oak.
  const wood = (part: PartSpec): THREE.Material => (new THREE.Color(part.colorHex).getHSL({ h: 0, s: 0, l: 0 }).l < 0.45 ? walnut : oak);
  return {
    ceramic,
    darkCeramic: new THREE.MeshPhysicalMaterial({ color: finishHexById("black_ceramic"), roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    metal,
    wood,
    counter: new THREE.MeshPhysicalMaterial({ color: "#f2f0eb", roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    water: new THREE.MeshPhysicalMaterial({ color: "#bcd9e3", roughness: 0.04, transparent: true, opacity: 0.6, clearcoat: 1 }),
    mirror: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.02, metalness: 1 }),
    dark: new THREE.MeshStandardMaterial({ color: "#2b2b2b", roughness: 0.8 }),
    prepareWood: (root) => root.traverse((child) => {
      if (child instanceof THREE.Mesh && (child.material === oak || child.material === walnut)) worldScaleUv(child.geometry);
    }),
  };
}

/** T-043: accent material for the wall behind the wet zone, per style. */
const ACCENT_WALL: Record<StylePreset, keyof typeof SURFACE_TEXTURES> = {
  "minimalist-modern": "microcement",
  "classic-luxury": "tile",
  "japanese-zen": "hinoki",
  "japanese-brutalism": "granite",
  japandi: "oak",
  scandinavian: "tile",
  "industrial-loft": "concrete",
  coastal: "white-oak",
  "dark-luxury": "granite",
};

/** Floor and wall surfaces from the style preset (default: white marble, or dark granite
 *  for a dark palette, + painted walls). With a style and a wet fixture position
 *  (`accentNear`, plan x/z), the wall nearest it gets the style's accent material. */
export function dressRoomShell(group: THREE.Group, style?: RoomStyle, onTextureLoad: () => void = () => undefined, accentNear?: { x: number; z: number }): void {
  const preset = style?.preset ? STYLES[style.preset] : undefined;
  const floor = preset?.floor ?? (isDarkPalette(style?.palette ?? []) ? "granite" : "marble");
  const wall = preset?.wall ?? "paint";
  const marble = floor === "marble" ? marbleFloorTexture() : null;
  const paint = wall === "paint" ? wallTexture() : null;
  // A preset owns the room materials, paint colour included.
  const wallColor = wallHex(preset ? { palette: preset.palette } : style);
  const accent = style?.preset ? ACCENT_WALL[style.preset] : isDarkPalette(style?.palette ?? []) ? "granite" : undefined;
  const walls = group.children.filter((c) => c.name.startsWith("room/wall-"));
  const accentWall = accent && accentNear
    ? walls.reduce<THREE.Object3D | undefined>((best, w) => (!best || Math.hypot(w.position.x - accentNear.x, w.position.z - accentNear.z) < Math.hypot(best.position.x - accentNear.x, best.position.z - accentNear.z) ? w : best), undefined)
    : undefined;
  for (const child of group.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    const material = child.material as THREE.MeshPhysicalMaterial;
    const box = (child.geometry as THREE.BoxGeometry).parameters;
    if (child === accentWall && accent) {
      applySurface(material, accent, box.width, box.height, onTextureLoad);
    } else if (child.name === "room/floor" && floor !== "marble") {
      applySurface(material, floor, box.width, box.depth, onTextureLoad);
    } else if (child.name.startsWith("room/wall-") && wall !== "paint") {
      applySurface(material, wall, box.width, box.height, onTextureLoad);
    } else if (child.name === "room/floor") {
      if (marble) {
        marble.repeat.set(box.width / 1200, box.depth / 1200);
        material.map = marble;
      }
      material.color.set("#ffffff");
      material.roughness = 0.18;
      material.clearcoat = 0.5;
      material.clearcoatRoughness = 0.15;
    } else if (child.name.startsWith("room/wall-")) {
      if (paint) {
        paint.repeat.set(2, 2);
        material.map = paint;
      }
      material.color.set(wallColor);
      material.roughness = 0.92;
      material.clearcoat = 0;
    }
    material.needsUpdate = true;
  }
}

const TRIM = new THREE.MeshStandardMaterial({ color: "#f7f6f2", roughness: 0.45 });
const MUNTIN = new THREE.MeshStandardMaterial({ color: "#26282a", roughness: 0.5, metalness: 0.2 });
const GLASS = new THREE.MeshPhysicalMaterial({ color: "#dfeef5", roughness: 0.02, metalness: 0, transparent: true, opacity: 0.18, clearcoat: 1 });

/** A box in an opening/wall frame: a along the wall, y up, n along the inward normal. */
function framed(group: THREE.Group, frame: { x: number; z: number; rotationY: number; inward: { x: number; z: number } }, size: { w: number; h: number; d: number }, a: number, y: number, n: number, material: THREE.Material, name: string): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.w, size.h, size.d), material);
  const dir = { x: Math.cos(frame.rotationY), z: -Math.sin(frame.rotationY) };
  mesh.position.set(frame.x + dir.x * a + frame.inward.x * n, y, frame.z + dir.z * a + frame.inward.z * n);
  mesh.rotation.y = frame.rotationY;
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  tagWall(mesh, frame, frame.inward);
  group.add(mesh);
}

/** Marks an object as belonging to a wall plane so the overview camera can cut it away. */
export function tagWall(object: THREE.Object3D, anchor: { x: number; z: number }, inward: { x: number; z: number }): void {
  object.userData.wallAnchor = { x: anchor.x, z: anchor.z };
  object.userData.wallInward = inward;
}

/** Hide wall-plane objects the camera sees from outside (cutaway); show the rest. */
export function applyCutaway(root: THREE.Object3D, camera: THREE.Vector3): void {
  root.traverse((child) => {
    const anchor = child.userData.wallAnchor as { x: number; z: number } | undefined;
    const n = child.userData.wallInward as { x: number; z: number } | undefined;
    if (anchor && n) child.visible = (camera.x - anchor.x) * n.x + (camera.z - anchor.z) * n.z > -60;
  });
}

function windowFrame(group: THREE.Group, o: OpeningSpec): void {
  const f = { x: o.centerMm.x, z: o.centerMm.z, rotationY: o.rotationY, inward: o.inward };
  const t = o.wallThicknessMm;
  const h = o.topMm - o.bottomMm;
  const cy = (o.bottomMm + o.topMm) / 2;
  const face = t / 2 + 9;
  const casing = 80;
  const name = `room/window-${o.id}`;
  // Interior casing (jambs + head) and a stool sill.
  for (const s of [-1, 1]) framed(group, f, { w: casing, h: h + casing, d: 18 }, s * (o.spanMm / 2 + casing / 2), cy + casing / 2, face, TRIM, name);
  framed(group, f, { w: o.spanMm + casing * 2, h: casing, d: 18 }, 0, o.topMm + casing / 2, face, TRIM, name);
  framed(group, f, { w: o.spanMm + casing * 2 + 40, h: 28, d: t + 60 }, 0, o.bottomMm - 14, 30, TRIM, name);
  // Frame in the reveal, glass, and a black muntin grid.
  for (const s of [-1, 1]) framed(group, f, { w: 50, h, d: 70 }, s * (o.spanMm / 2 - 25), cy, 0, TRIM, name);
  framed(group, f, { w: o.spanMm, h: 50, d: 70 }, 0, o.topMm - 25, 0, TRIM, name);
  framed(group, f, { w: o.spanMm - 100, h: h - 50, d: 6 }, 0, cy - 25 + 25, 0, GLASS, name);
  const cols = o.spanMm > 900 ? 3 : 2;
  const rows = 3;
  for (let c = 1; c < cols; c++) framed(group, f, { w: 20, h: h - 50, d: 24 }, -o.spanMm / 2 + 50 + ((o.spanMm - 100) * c) / cols, cy, 8, MUNTIN, name);
  for (let r = 1; r < rows; r++) framed(group, f, { w: o.spanMm - 100, h: 20, d: 24 }, 0, o.bottomMm + ((h - 50) * r) / rows, 8, MUNTIN, name);
  for (const s of [-1, 1]) framed(group, f, { w: 24, h: h - 50, d: 26 }, s * (o.spanMm / 2 - 62), cy, 8, MUNTIN, name);
}

function doorFrame(group: THREE.Group, o: OpeningSpec, leaf: THREE.Material): void {
  const f = { x: o.centerMm.x, z: o.centerMm.z, rotationY: o.rotationY, inward: o.inward };
  const t = o.wallThicknessMm;
  const face = t / 2 + 9;
  const casing = 80;
  const name = `room/door-${o.id}`;
  for (const s of [-1, 1]) {
    framed(group, f, { w: casing, h: o.topMm + casing, d: 18 }, s * (o.spanMm / 2 + casing / 2), (o.topMm + casing) / 2, face, TRIM, name);
    framed(group, f, { w: 20, h: o.topMm, d: t }, s * (o.spanMm / 2 - 10), o.topMm / 2, 0, TRIM, name);
  }
  framed(group, f, { w: o.spanMm + casing * 2, h: casing, d: 18 }, 0, o.topMm + casing / 2, face, TRIM, name);
  framed(group, f, { w: o.spanMm, h: 20, d: t }, 0, o.topMm - 10, 0, TRIM, name);
  // Leaf standing open 90° into the room from the start-side hinge (inside the swing zone).
  const hinge = { x: f.x - Math.cos(f.rotationY) * (o.spanMm / 2 - 20), z: f.z + Math.sin(f.rotationY) * (o.spanMm / 2 - 20) };
  const leafW = o.spanMm - 40;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(40, o.topMm - 30, leafW), leaf);
  const rot = f.rotationY;
  mesh.position.set(hinge.x + f.inward.x * (t / 2 + leafW / 2) - Math.cos(rot) * 20, (o.topMm - 30) / 2, hinge.z + f.inward.z * (t / 2 + leafW / 2) + Math.sin(rot) * 20);
  mesh.rotation.y = rot;
  mesh.name = name;
  mesh.castShadow = true;
  tagWall(mesh, f, f.inward);
  group.add(mesh);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(28, 16, 12), MUNTIN);
  knob.position.set(mesh.position.x + f.inward.x * (leafW / 2 - 70) + Math.cos(rot) * 40, 1000, mesh.position.z + f.inward.z * (leafW / 2 - 70) - Math.sin(rot) * 40);
  knob.name = name;
  tagWall(knob, f, f.inward);
  group.add(knob);
}

/** Baseboards on every interior wall face, window and door framing. */
export function buildArchitecture(spec: SceneSpec): THREE.Group {
  const group = new THREE.Group();
  group.name = "architecture";
  for (const part of spec.parts) {
    if (!part.inward || part.shape.shape !== "box" || part.part.includes("-head-")) continue;
    const { w, d } = part.shape.sizeMm;
    framed(group, { x: part.positionMm.x, z: part.positionMm.z, rotationY: part.rotationY, inward: part.inward }, { w, h: 110, d: 14 }, 0, 55, d / 2 + 7, TRIM, `room/baseboard-${part.part}`);
  }
  const leaf = new THREE.MeshStandardMaterial({ color: "#f3f1ec", roughness: 0.5 });
  for (const o of spec.openings) {
    if (o.kind === "window") windowFrame(group, o);
    else doorFrame(group, o, leaf);
  }
  return group;
}

const COUNTER = new THREE.MeshPhysicalMaterial({ color: "#f2f0eb", roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.2 });
const COUNTER_THICKNESS_MM = 40;
const COUNTER_MARGIN_MM = 60;
const CABINET = new THREE.MeshStandardMaterial({ color: "#b99b78", roughness: 0.6 });
const CABINET_INSET_MM = 30;
const CABINET_PANEL_MM = 18;
const PLINTH_MM = 90;
const TRAP = new THREE.MeshStandardMaterial({ color: "#c9d1d4", metalness: 0.9, roughness: 0.25 });
const TRAP_RADIUS_MM = 18;
const TRAP_DROP_MM = 260;

const isWallMountBasin = (part: PartSpec): boolean => /wall-(mount|hung)/.test((part.productName ?? "").toLowerCase());

/**
 * Presentation-only supports for standalone basins (T-027a, T-034), never a KOHLER product
 * and never in the BOM:
 * - undercounter / vessel basins: a counter slab at COUNTER_HEIGHT_MM standing on a base
 *   cabinet down to the floor (the catalog says their support is not included, and a bare
 *   slab looked like it floated);
 * - wall-mount basins: a chrome bottle trap and waste pipe into the wall under the bowl.
 * Deck faucets sit on their basin's deck/slab (T-028). One support per placed basin
 * (parts grouped by model).
 */
export function buildSupports(spec: SceneSpec): THREE.Group {
  const group = new THREE.Group();
  group.name = "supports";
  const byModel = new Map<string, PartSpec[]>();
  const wallHung = new Map<string, PartSpec[]>();
  for (const part of spec.parts) {
    if (part.fixtureClass !== "basin") continue;
    const target = isWallMountBasin(part) ? wallHung : byModel;
    target.set(part.modelId, [...(target.get(part.modelId) ?? []), part]);
  }
  for (const [modelId, parts] of wallHung) group.add(wasteTrap(modelId, parts));
  for (const [modelId, parts] of byModel) {
    // Union of the parts in the first part's wall frame (a along the wall, n into the room).
    const origin = parts[0];
    const rot = origin.rotationY;
    const dir = { x: Math.cos(rot), z: -Math.sin(rot) };
    const inward = { x: Math.sin(rot), z: Math.cos(rot) };
    let a0 = Infinity, a1 = -Infinity, n0 = Infinity, n1 = -Infinity;
    for (const p of parts) {
      const half = p.shape.shape === "box" ? { w: p.shape.sizeMm.w / 2, d: p.shape.sizeMm.d / 2 } : { w: p.shape.radiusMm, d: p.shape.radiusMm };
      const dx = p.positionMm.x - origin.positionMm.x;
      const dz = p.positionMm.z - origin.positionMm.z;
      const a = dx * dir.x + dz * dir.z;
      const n = dx * inward.x + dz * inward.z;
      a0 = Math.min(a0, a - half.w); a1 = Math.max(a1, a + half.w);
      n0 = Math.min(n0, n - half.d); n1 = Math.max(n1, n + half.d);
    }
    // Parts may stand off the wall (catalog z offsets); the slab runs back into the wall
    // by the margin so it always meets the wall face, and past the front by the margin.
    const w = a1 - a0 + COUNTER_MARGIN_MM * 2;
    const d = n1 - n0 + COUNTER_MARGIN_MM * 2;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, -d / 2); shape.lineTo(w / 2, -d / 2); shape.lineTo(w / 2, d / 2); shape.lineTo(-w / 2, d / 2); shape.closePath();
    const undercounter = origin.fixtureClass === "basin" && !(origin.productName ?? "").toLowerCase().includes("vessel");
    if (undercounter) {
      // Oval cut-out over the bowl, like a vanity top (shape y = -local z).
      const hole = new THREE.Path();
      // Bowl sits in front of the faucet deck (shape y = -local z, so forward is -y).
      const deck = basinDeckMm(origin, spec.parts);
      hole.absellipse(0, -deck / 2, (a1 - a0) * 0.44, (n1 - n0 - deck) * 0.42, 0, Math.PI * 2, false, 0);
      shape.holes.push(hole);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: COUNTER_THICKNESS_MM, bevelEnabled: false, curveSegments: 32 });
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, COUNTER);
    const ca = (a0 + a1) / 2;
    const cn = (n0 + n1) / 2;
    mesh.position.set(origin.positionMm.x + dir.x * ca + inward.x * cn, COUNTER_HEIGHT_MM - COUNTER_THICKNESS_MM, origin.positionMm.z + dir.z * ca + inward.z * cn);
    mesh.rotation.y = rot;
    mesh.name = `support/${modelId}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Base cabinet under the slab: inset at the sides and front, back against the wall,
    // on a recessed plinth, so the counter visibly stands on the floor.
    const cabinet = new THREE.Group();
    cabinet.name = `support-cabinet/${modelId}`;
    // Open-topped carcass (panels, not a solid block) so an undercounter bowl hangs
    // inside it instead of being swallowed.
    const bodyW = w - CABINET_INSET_MM * 2;
    const bodyD = d - CABINET_INSET_MM;
    const bodyH = COUNTER_HEIGHT_MM - COUNTER_THICKNESS_MM - PLINTH_MM;
    const zc = -CABINET_INSET_MM / 2; // body centre, back flush with the slab back
    const t = CABINET_PANEL_MM;
    const panel = (pw: number, ph: number, pd: number, x: number, y: number, z: number): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), CABINET);
      m.position.set(x, y, z);
      return m;
    };
    const yMid = PLINTH_MM + bodyH / 2;
    const panels = [
      panel(t, bodyH, bodyD, -bodyW / 2 + t / 2, yMid, zc), // left side
      panel(t, bodyH, bodyD, bodyW / 2 - t / 2, yMid, zc), // right side
      panel(bodyW, bodyH, t, 0, yMid, zc + bodyD / 2 - t / 2), // front
      panel(bodyW, bodyH, t, 0, yMid, zc - bodyD / 2 + t / 2), // back
      panel(bodyW, t, bodyD, 0, PLINTH_MM + t / 2, zc), // bottom
      panel(bodyW - 40, PLINTH_MM, bodyD - 60, 0, PLINTH_MM / 2, zc - 30), // recessed plinth
    ];
    for (const m of panels) {
      m.castShadow = true;
      m.receiveShadow = true;
      cabinet.add(m);
    }
    // Shape y = -local z, so the slab's back (wall side) is local -z → the body shifts back.
    cabinet.position.set(mesh.position.x, 0, mesh.position.z);
    cabinet.rotation.y = rot;
    group.add(cabinet);
  }
  return group;
}

/** Bottle trap under a wall-mount bowl: a short drop from the bowl's underside, then a
 *  waste pipe back into the wall face. */
function wasteTrap(modelId: string, parts: PartSpec[]): THREE.Group {
  const origin = parts[0];
  const rot = origin.rotationY;
  const inward = { x: Math.sin(rot), z: Math.cos(rot) };
  const halfH = (p: PartSpec): number => (p.shape.shape === "box" ? p.shape.sizeMm.h : p.shape.hMm) / 2;
  const halfD = (p: PartSpec): number => (p.shape.shape === "box" ? p.shape.sizeMm.d : p.shape.radiusMm * 2) / 2;
  const bowlBottom = Math.min(...parts.map((p) => p.positionMm.y - halfH(p)));
  const cx = parts.reduce((t, p) => t + p.positionMm.x, 0) / parts.length;
  const cz = parts.reduce((t, p) => t + p.positionMm.z, 0) / parts.length;
  // Distance from the fixture centre back to the wall face along -inward.
  const back = Math.max(...parts.map((p) => {
    const n = (p.positionMm.x - cx) * inward.x + (p.positionMm.z - cz) * inward.z;
    return halfD(p) - n;
  }));
  const reach = back * 0.5; // trap sits halfway between the wall and the bowl centre
  const trap = new THREE.Group();
  trap.name = `support-trap/${modelId}`;
  const drop = new THREE.Mesh(new THREE.CylinderGeometry(TRAP_RADIUS_MM, TRAP_RADIUS_MM, TRAP_DROP_MM, 20), TRAP);
  drop.position.set(0, bowlBottom - TRAP_DROP_MM / 2, -reach);
  const pipeLength = back - reach;
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(TRAP_RADIUS_MM * 0.8, TRAP_RADIUS_MM * 0.8, pipeLength, 16), TRAP);
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(0, bowlBottom - TRAP_DROP_MM + TRAP_RADIUS_MM, -reach - pipeLength / 2);
  for (const m of [drop, pipe]) {
    m.castShadow = true;
    trap.add(m);
  }
  trap.position.set(cx, 0, cz);
  trap.rotation.y = rot;
  return trap;
}
