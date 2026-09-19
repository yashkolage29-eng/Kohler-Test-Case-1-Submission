// T-015 procedural three.js builder: SceneSpec → THREE.Group. Deterministic — parts
// become meshes in spec order with PBR materials (MeshPhysicalMaterial),
// rich lighting, and AI-placed décor (buildPlacedDecor). No external assets (PRD N1: offline).
// Interactive orbit control is attached by the DOM-only mountRender3d convenience;
// scene construction itself is DOM-free.
import * as THREE from "three";
import { finishHex, type PartSpec, type SceneSpec } from "./sceneSpec.js";
import type { PlacedDecor } from "@kolher/engine";
import { basinDeckMm, detailedPart } from "./detail.js";
import { detailMaterials, dressRoomShell, tagWall, type RoomStyle } from "./room3d.js";

const FINISH_MAP: Record<string, { roughness: number; metalness: number }> = {
  white: { roughness: 0.85, metalness: 0.0 },
  chrome: { roughness: 0.08, metalness: 1.0 },
  brushed_nickel: { roughness: 0.25, metalness: 0.9 },
  matte_black: { roughness: 0.5, metalness: 0.05 },
  brushed_gold: { roughness: 0.2, metalness: 0.8 },
  stone: { roughness: 0.7, metalness: 0.0 },
  vibrant_brushed_moderne_brass: { roughness: 0.22, metalness: 0.85 },
};

function propsForFinishId(id: string | undefined): { roughness: number; metalness: number } {
  if (!id) return { roughness: 0.85, metalness: 0.0 };
  return FINISH_MAP[id] ?? { roughness: 0.85, metalness: 0.0 };
}

/** Map one PartSpec to a THREE.Mesh with PBR material (named for scene-graph audit). */
function partMesh(part: PartSpec): THREE.Mesh {
  let geometry: THREE.BufferGeometry;
  if (part.shape.shape === "box") {
    const { w, h, d } = part.shape.sizeMm;
    geometry = new THREE.BoxGeometry(w, h, d);
  } else {
    geometry = new THREE.CylinderGeometry(part.shape.radiusMm, part.shape.radiusMm, part.shape.hMm, 24);
  }
  const isRoom = part.fixtureClass === "room";
  const props = part.materialProps ?? propsForFinishId(part.finishId);
  const material = new THREE.MeshPhysicalMaterial({
    color: part.colorHex,
    roughness: props.roughness,
    metalness: props.metalness,
    clearcoat: isRoom ? 0.1 : 0.3,
    clearcoatRoughness: isRoom ? 0.9 : 0.2,
    reflectivity: isRoom ? 0.05 : 0.5,
    side: isRoom ? THREE.DoubleSide : THREE.FrontSide,
    envMapIntensity: 1.0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${part.modelId}/${part.part}`;
  mesh.position.set(part.positionMm.x, part.positionMm.y, part.positionMm.z);
  mesh.rotation.y = part.rotationY;
  mesh.receiveShadow = true;
  mesh.castShadow = part.fixtureClass !== "room";
  return mesh;
}

export interface SceneGroupOptions {
  style?: RoomStyle;
  /** Called when a bundled texture finishes loading (the caller redraws). */
  onTextureLoad?: () => void;
  /** false keeps the plain catalog primitives (no detail meshes). */
  detail?: boolean;
}

/** Build the scene group from a SceneSpec: one child per part, in spec order. Fixture
 *  parts get a procedural detail mesh inside their primitive box; room parts and any
 *  part without a detailer keep the primitive. */
export function buildSceneGroup(spec: SceneSpec, opts: SceneGroupOptions = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = "bathroom";
  const materials = opts.detail === false ? undefined : detailMaterials(finishHex, opts.onTextureLoad ?? (() => undefined));
  spec.parts.forEach((part, i) => {
    const siblings = spec.parts.filter((other) => other !== part && other.modelId === part.modelId && part.fixtureClass !== "room");
    const deckMm = part.fixtureClass === "basin" ? basinDeckMm(part, spec.parts) : undefined;
    const detail = materials ? detailedPart(part, { siblings, materials, deckMm }) : null;
    const object: THREE.Object3D = detail ?? partMesh(part);
    if (detail) {
      detail.name = `${part.modelId}/${part.part}`;
      detail.position.set(part.positionMm.x, part.positionMm.y, part.positionMm.z);
      detail.rotation.y = part.rotationY;
      materials?.prepareWood(detail);
    }
    object.userData.specIndex = i;
    if (part.inward) tagWall(object, { x: part.positionMm.x, z: part.positionMm.z }, part.inward);
    group.add(object);
  });
  dressRoomShell(group, opts.style, opts.onTextureLoad);
  return group;
}

// ---------------------------------------------------------------------------
// AI décor (T-025): procedural meshes for engine-placed PlacedDecor items.
// Presentation only — never KOHLER products, never in the BOM.

const METAL: Record<PlacedDecor["metal"], { color: string; roughness: number; metalness: number }> = {
  chrome: { color: "#d9dde1", roughness: 0.12, metalness: 1 },
  brass: { color: "#b8893b", roughness: 0.28, metalness: 0.9 },
  black: { color: "#1e1e1e", roughness: 0.45, metalness: 0.4 },
  nickel: { color: "#b9b5ab", roughness: 0.25, metalness: 0.9 },
};
/** Décor point lights use decay 0 + a cutoff distance: this scene is in millimetres,
 *  where physical inverse-square falloff would make any sane intensity invisible. */
const DECOR_LIGHT_SCALE = 1.1;
const DECOR_LIGHT_RANGE_MM = 2600;
const MAX_SCENE_DECOR_LIGHTS = 3;

function matte(color: THREE.ColorRepresentation, roughness = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}
function glow(color: THREE.ColorRepresentation, intensity = 1.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
}
function glass(): THREE.MeshPhysicalMaterial {
  // No environment map in this scene, so a high-metalness mirror reflects nothing and
  // renders black; a bright low-metal glass with a faint glow reads as a mirror instead.
  return new THREE.MeshPhysicalMaterial({ color: "#e4eef2", emissive: "#b8c8d0", emissiveIntensity: 0.25, roughness: 0.08, metalness: 0.15, clearcoat: 1 });
}

/** Add a mesh at local (x, y, z) where y is measured from the item's bottom. */
function put(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, bottom: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, bottom + y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function decorMeshes(item: PlacedDecor, group: THREE.Group): void {
  const { w, h, d } = item.sizeMm;
  const b = -h / 2; // local bottom; the group sits at the item's bounding-box centre
  const metal = METAL[item.metal];
  const metalMat = new THREE.MeshStandardMaterial({ color: metal.color, roughness: metal.roughness, metalness: metal.metalness });
  const light = item.light?.color ?? "#fff4e5";
  const leaf = new THREE.Color(item.color).lerp(new THREE.Color("#4d7a45"), 0.65);
  switch (item.type) {
    case "pendant": {
      const shadeH = h * 0.45;
      put(group, new THREE.CylinderGeometry(4, 4, h - shadeH, 8), metalMat, 0, h - (h - shadeH) / 2, 0, b);
      put(group, new THREE.CylinderGeometry(w * 0.18, w / 2, shadeH, 28, 1, true), new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.5, side: THREE.DoubleSide }), 0, shadeH / 2, 0, b);
      put(group, new THREE.SphereGeometry(w * 0.13, 16, 12), glow(light, 2.2), 0, shadeH * 0.3, 0, b).castShadow = false;
      break;
    }
    case "sconce": {
      put(group, new THREE.BoxGeometry(w * 0.7, h * 0.5, 12), metalMat, 0, h * 0.4, -d / 2 + 6, b);
      put(group, new THREE.CylinderGeometry(w * 0.42, w * 0.42, h * 0.75, 20), glow(light, 1.4), 0, h * 0.5, d * 0.1, b).castShadow = false;
      break;
    }
    case "backlit-mirror": {
      put(group, new THREE.BoxGeometry(w, h, d * 0.4), glow(light, 2), 0, h / 2, -d * 0.3, b).castShadow = false;
      put(group, new THREE.BoxGeometry(w - 40, h - 40, d * 0.6), glass(), 0, h / 2, d * 0.2, b);
      break;
    }
    case "mirror": {
      put(group, new THREE.BoxGeometry(w, h, d * 0.6), metalMat, 0, h / 2, -d * 0.2, b);
      put(group, new THREE.BoxGeometry(w - 50, h - 50, d * 0.4), glass(), 0, h / 2, d * 0.3, b);
      break;
    }
    case "art": {
      put(group, new THREE.BoxGeometry(w, h, d * 0.7), metalMat, 0, h / 2, -d * 0.15, b);
      put(group, new THREE.BoxGeometry(w - 60, h - 60, d * 0.3), matte(item.color, 0.9), 0, h / 2, d * 0.35, b);
      break;
    }
    case "plant":
    case "small-plant": {
      const potH = h * 0.32;
      put(group, new THREE.CylinderGeometry(w * 0.3, w * 0.22, potH, 20), matte(item.type === "plant" ? "#b98a6a" : item.color, 0.7), 0, potH / 2, 0, b);
      const clusters = item.type === "plant" ? 5 : 3;
      for (let i = 0; i < clusters; i++) {
        const a = (i / clusters) * Math.PI * 2;
        const r = w * (i === 0 ? 0 : 0.18);
        const s = w * (i === 0 ? 0.34 : 0.26);
        const cluster = put(group, new THREE.IcosahedronGeometry(s, 1), matte(leaf.clone().offsetHSL(0, 0, (i % 2) * 0.05), 0.8), Math.cos(a) * r, potH + (h - potH) * (i === 0 ? 0.62 : 0.42) , Math.sin(a) * r, b);
        cluster.scale.y = 1.15;
      }
      break;
    }
    case "rug": {
      put(group, new THREE.BoxGeometry(w, h, d), matte(item.color, 1), 0, h / 2, 0, b).castShadow = false;
      break;
    }
    case "towel": {
      put(group, new THREE.CylinderGeometry(8, 8, w + 60, 12), metalMat, 0, h * 0.9, 0, b).rotation.z = Math.PI / 2;
      put(group, new THREE.BoxGeometry(w, h * 0.85, d * 0.5), matte(item.color, 1), 0, h * 0.45, 0, b);
      break;
    }
    case "vase": {
      put(group, new THREE.CylinderGeometry(w * 0.28, w * 0.45, h * 0.8, 20), new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.35 }), 0, h * 0.4, 0, b);
      put(group, new THREE.CylinderGeometry(w * 0.2, w * 0.28, h * 0.2, 20), new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.35 }), 0, h * 0.9, 0, b);
      break;
    }
    case "candles": {
      const heights = [h * 0.75, h * 0.55, h * 0.4];
      heights.forEach((ch, i) => {
        const x = (i - 1) * w * 0.32;
        const z = i === 1 ? d * 0.15 : -d * 0.1;
        put(group, new THREE.CylinderGeometry(w * 0.12, w * 0.12, ch, 16), matte(item.color, 0.6), x, ch / 2, z, b);
        put(group, new THREE.SphereGeometry(w * 0.04, 8, 6), glow("#ffb347", 3), x, ch + w * 0.05, z, b).castShadow = false;
      });
      break;
    }
    case "shelf": {
      put(group, new THREE.BoxGeometry(w, h * 0.6, d), matte(item.color, 0.7), 0, h * 0.7, 0, b);
      for (const side of [-1, 1]) put(group, new THREE.BoxGeometry(12, h * 0.4, d * 0.8), metalMat, side * w * 0.35, h * 0.2, -d * 0.1, b);
      break;
    }
    // Fallbacks until the bundled models load (or if they never do).
    case "chandelier": {
      put(group, new THREE.CylinderGeometry(4, 4, h * 0.4, 8), metalMat, 0, h * 0.8, 0, b);
      put(group, new THREE.TorusGeometry(w * 0.35, 10, 8, 32), metalMat, 0, h * 0.35, 0, b).rotation.x = Math.PI / 2;
      put(group, new THREE.SphereGeometry(w * 0.12, 16, 12), glow(light, 2.2), 0, h * 0.35, 0, b).castShadow = false;
      break;
    }
    case "lantern": {
      put(group, new THREE.BoxGeometry(w, h * 0.85, d), new THREE.MeshStandardMaterial({ color: "#f3e7cf", emissive: light, emissiveIntensity: 0.5, roughness: 0.8 }), 0, h * 0.45, 0, b);
      put(group, new THREE.BoxGeometry(w * 1.1, h * 0.08, d * 1.1), metalMat, 0, h * 0.96, 0, b);
      break;
    }
    case "bench": {
      put(group, new THREE.BoxGeometry(w, h * 0.12, d), matte(item.color, 0.6), 0, h * 0.94, 0, b);
      for (const side of [-1, 1]) put(group, new THREE.BoxGeometry(40, h * 0.88, d * 0.9), matte(item.color, 0.6), side * (w / 2 - 60), h * 0.44, 0, b);
      break;
    }
    case "basket": {
      put(group, new THREE.CylinderGeometry(w / 2, w * 0.42, h, 24), matte("#b89468", 0.95), 0, h / 2, 0, b);
      break;
    }
    case "bowl": {
      put(group, new THREE.CylinderGeometry(w / 2, w * 0.3, h, 24), matte(item.color, 0.7), 0, h / 2, 0, b);
      break;
    }
    case "stool": {
      put(group, new THREE.CylinderGeometry(w / 2, w / 2, h * 0.1, 28), matte(item.color, 0.6), 0, h * 0.95, 0, b);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        put(group, new THREE.CylinderGeometry(12, 12, h * 0.9, 8), metalMat, Math.cos(a) * w * 0.33, h * 0.45, Math.sin(a) * w * 0.33, b);
      }
      break;
    }
  }
}

/** One group per placed item at its bounding-box centre (x = room x, y = height,
 *  z = room y), rotated about world up. At most 3 emitting point lights are added. */
export function buildPlacedDecor(items: PlacedDecor[]): THREE.Group {
  const root = new THREE.Group();
  root.name = "decor";
  let lights = 0;
  for (const item of items) {
    const group = new THREE.Group();
    group.name = item.id;
    group.userData.decorId = item.id;
    group.position.set(item.positionMm.x, item.positionMm.y, item.positionMm.z);
    group.rotation.y = item.rotationY;
    decorMeshes(item, group);
    // Wall-mounted décor disappears with its wall in the overview cutaway.
    if (item.mount === "wall") tagWall(group, { x: item.positionMm.x, z: item.positionMm.z }, { x: Math.sin(item.rotationY), z: Math.cos(item.rotationY) });
    if (item.light && lights < MAX_SCENE_DECOR_LIGHTS) {
      const lamp = new THREE.PointLight(item.light.color, item.light.intensity * DECOR_LIGHT_SCALE, DECOR_LIGHT_RANGE_MM, 0);
      // Ceiling lights glow below the shade; lanterns inside; wall lights just in front of the wall.
      const hanging = item.mount === "ceiling";
      lamp.position.set(0, hanging ? -item.sizeMm.h * 0.3 : 0, hanging || item.mount === "floor" ? 0 : item.sizeMm.d / 2 + 80);
      lamp.userData.targetIntensity = lamp.intensity;
      group.add(lamp);
      lights++;
    }
    group.traverse((child) => { child.userData.decorId = item.id; });
    root.add(group);
  }
  return root;
}

/** Rich, realistic lighting: warm key + cool fill + ambient + hemisphere + ceiling glow. */
export function addLights(scene: THREE.Scene): void {
  // Tuned for the environment map added in mountRender3d (reflections carry much of the fill).
  scene.add(new THREE.AmbientLight(0xfff5e6, 0.18));
  scene.add(new THREE.HemisphereLight(0xf0f4f8, 0xd4c5a9, 0.35));
  const key = new THREE.DirectionalLight(0xfff0d8, 1.7);
  key.position.set(3000, 5000, 4000);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 500;
  key.shadow.camera.far = 15000;
  key.shadow.camera.left = key.shadow.camera.bottom = -8000;
  key.shadow.camera.right = key.shadow.camera.top = 8000;
  key.shadow.bias = -0.001;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc8d8ff, 0.35);
  fill.position.set(-3000, 3000, -2000);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffe8c8, 0.25);
  rim.position.set(0, 2000, -4000);
  scene.add(rim);
  const bounce = new THREE.PointLight(0xffe8d0, 0.2, 8000, 2);
  bounce.position.set(0, 300, 0);
  scene.add(bounce);
}

/** Ceiling lamp fixture + warm point light, hung at the room center. */
export function addCeilingLamp(scene: THREE.Scene, spec: SceneSpec): void {
  if (spec.parts.length === 0) return;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of spec.parts) {
    minX = Math.min(minX, p.positionMm.x); maxX = Math.max(maxX, p.positionMm.x);
    minZ = Math.min(minZ, p.positionMm.z); maxZ = Math.max(maxZ, p.positionMm.z);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const lampY = 2400;

  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8, 400, 12),
    new THREE.MeshPhysicalMaterial({ color: 0x3a3d41, roughness: 0.4, metalness: 0.6, clearcoat: 0.3 }),
  );
  rod.name = "room/lamp-rod";
  rod.position.set(cx, lampY + 200, cz);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(220, 300, 200, 32, 1, true),
    new THREE.MeshPhysicalMaterial({ color: 0xfaf8f2, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide }),
  );
  shade.name = "room/lamp-shade";
  shade.position.set(cx, lampY - 100, cz);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(80, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff8e8 }),
  );
  bulb.name = "room/lamp-bulb";
  bulb.position.set(cx, lampY - 150, cz);
  scene.add(rod, shade, bulb);

  const glow = new THREE.PointLight(0xffe9c4, 2.0, Math.max(maxX - minX, maxZ - minZ) * 2.0, 2);
  glow.position.set(cx, lampY - 160, cz);
  scene.add(glow);
}

/** Default camera position for free orbit: elevated 3/4 view over the room center. */
export function defaultCameraPosition(spec: SceneSpec): { x: number; y: number; z: number } {
  if (spec.parts.length === 0) return { x: 2000, y: 3000, z: 2000 };
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of spec.parts) {
    minX = Math.min(minX, p.positionMm.x); maxX = Math.max(maxX, p.positionMm.x);
    minY = Math.min(minY, p.positionMm.y); maxY = Math.max(maxY, p.positionMm.y);
    minZ = Math.min(minZ, p.positionMm.z); maxZ = Math.max(maxZ, p.positionMm.z);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxZ - minZ);
  const y = Math.max(maxY, 2000) + span * 0.8;
  return { x: cx + span * 0.6, y, z: cz + span * 0.8 };
}

export function lookAtPoint(spec: SceneSpec): { x: number; y: number; z: number } {
  if (spec.parts.length === 0) return { x: 0, y: 0, z: 0 };
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of spec.parts) {
    minX = Math.min(minX, p.positionMm.x); maxX = Math.max(maxX, p.positionMm.x);
    minZ = Math.min(minZ, p.positionMm.z); maxZ = Math.max(maxZ, p.positionMm.z);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxZ - minZ);
  return { x: cx, y: span * 0.15, z: cz };
}
