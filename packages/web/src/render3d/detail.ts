// T-026c procedural fixture detail: replaces a catalog primitive's plain box/cylinder
// with a recognisable mesh (tub, toilet, basin, vanity, faucet, shower head, accessory).
// Presentation only. Every detail mesh is built inside the primitive's own box
// (local frame: x = along the wall, y = up, +z = into the room, centred on the part),
// so the engine AABB stays the authority; unknown parts return null and keep the box.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { PartSpec } from "./sceneSpec.js";

export interface DetailContext {
  /** Other parts of the same placed fixture (same modelId). */
  siblings: PartSpec[];
  materials: DetailMaterials;
  /** Basins only: depth (mm, from the wall) of the back deck a mounted faucet stands on. */
  deckMm?: number;
}

/** Back-deck depth a basin keeps free for the deck faucet the engine mounts on it
 *  (T-028): the faucet's upright (cylinder) parts inside the basin footprint, plus a
 *  small margin, capped so the bowl keeps most of the depth. 0 when no faucet sits on it. */
export function basinDeckMm(basin: PartSpec, parts: PartSpec[]): number {
  const { w, d } = partSize(basin);
  const dir = { x: Math.cos(basin.rotationY), z: -Math.sin(basin.rotationY) };
  const inward = { x: Math.sin(basin.rotationY), z: Math.cos(basin.rotationY) };
  let deck = 0;
  for (const p of parts) {
    if (p.fixtureClass !== "faucet") continue;
    // Upright parts: cylinders, and whole-faucet boxes whose column stands at the back.
    const size = partSize(p);
    const standing = p.shape.shape === "cylinder" ? size.d / 2 : p.part === "body" ? Math.min(size.w, size.d) - size.d / 2 : undefined;
    if (standing === undefined) continue;
    const dx = p.positionMm.x - basin.positionMm.x;
    const dz = p.positionMm.z - basin.positionMm.z;
    const along = dx * dir.x + dz * dir.z;
    const fromBack = dx * inward.x + dz * inward.z + d / 2;
    if (Math.abs(along) > w / 2 || fromBack < 0 || fromBack > d) continue;
    deck = Math.max(deck, fromBack + standing + 8);
  }
  return Math.min(deck, d * 0.45);
}

export interface DetailMaterials {
  ceramic: THREE.Material;
  metal: (part: PartSpec) => THREE.Material;
  wood: (part: PartSpec) => THREE.Material;
  counter: THREE.Material;
  water: THREE.Material;
  mirror: THREE.Material;
  dark: THREE.Material;
}

/** Part box size (w along x, h up, d along z) for either primitive shape. */
export function partSize(part: PartSpec): { w: number; h: number; d: number } {
  return part.shape.shape === "box"
    ? part.shape.sizeMm
    : { w: part.shape.radiusMm * 2, h: part.shape.hMm, d: part.shape.radiusMm * 2 };
}

/** Builder frame: y from 0 (bottom) to h, z from 0 (wall) to d, x centred. */
class Frame {
  readonly group = new THREE.Group();
  constructor(readonly w: number, readonly h: number, readonly d: number) {
    this.group.position.set(0, -h / 2, -d / 2);
  }
  add(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }
  /** Box by its bottom-back-centre corner convention: centre x, bottom y, back z. */
  box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, radius = 0): THREE.Mesh {
    const r = Math.min(radius, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01);
    const geometry = r > 0.5 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
    return this.add(geometry, material, x, y + h / 2, z + d / 2);
  }
}

/** Lathe of a (radius 0..1, y mm) profile, scaled to an ellipse of rx × rz. */
function ellipticLathe(profile: [number, number][], rx: number, rz: number): THREE.LatheGeometry {
  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 48);
  geometry.scale(rx, 1, rz);
  return geometry;
}

/** Hollow bowl (open top) filling rx × depth × rz: outer wall, rim, inner wall, floor. */
function bowlProfile(depth: number, rim = 0.08, flare = 0.82): [number, number][] {
  return [[0, 0], [flare, 0], [0.97, depth * 0.72], [1, depth], [1 - rim, depth], [(1 - rim) * 0.94, depth * 0.45], [(1 - rim) * 0.7, depth * 0.1], [0, depth * 0.08]];
}

function roundedRectShape(w: number, d: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Vertical extrusion of a plan shape (shape x → x, shape y → -z) from y = 0 to height. */
function extrudeUp(shape: THREE.Shape, height: number): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 24 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function tube(points: [number, number, number][], radius: number): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return new THREE.TubeGeometry(curve, 24, radius, 12, false);
}

const has = (ctx: DetailContext, name: string): boolean => ctx.siblings.some((s) => s.part === name);
const named = (part: PartSpec, word: string): boolean => (part.productName ?? "").toLowerCase().includes(word);

function toilet(part: PartSpec, ctx: DetailContext, f: Frame): void {
  const { w, h, d } = f;
  const m = ctx.materials;
  const twoPiece = has(ctx, "tank");
  if (part.part === "tank") {
    f.box(w, h * 0.9, d, m.ceramic, 0, 0, 0, 28);
    f.box(w, h * 0.1, d, m.ceramic, 0, h * 0.9, 0, 12);
    f.add(new THREE.CylinderGeometry(Math.min(w, d) * 0.08, Math.min(w, d) * 0.08, 6, 20), ctx.materials.metal(part), 0, h - 3, d * 0.5);
    return;
  }
  if (part.part === "seat") {
    f.add(ellipticLathe([[0, 0], [1, 0], [1, h * 0.6], [0.97, h], [0, h]], w / 2, d / 2), m.ceramic, 0, 0, d / 2);
    return;
  }
  // Bowl. One-piece units draw their own tank and seat inside the single box.
  const wallHung = named(part, "wall-hung");
  const tankD = twoPiece ? 0 : d * 0.26;
  const bowlD = d - tankD;
  const seatY = twoPiece ? h * 0.92 : Math.min(h * 0.62, 440);
  if (!twoPiece) {
    f.box(w * 0.9, h - seatY + h * 0.08, tankD, m.ceramic, 0, seatY - h * 0.08, 0, 30);
    f.add(new THREE.CylinderGeometry(w * 0.06, w * 0.06, 6, 20), ctx.materials.metal(part), 0, h - 3, tankD / 2);
  }
  const bowlTop = seatY - (twoPiece ? 0 : 36);
  const pedestalH = wallHung ? 0 : bowlTop * 0.55;
  if (pedestalH > 0) f.add(ellipticLathe([[0, 0], [0.62, 0], [0.5, pedestalH], [0, pedestalH]], w * 0.36, bowlD * 0.34), m.ceramic, 0, 0, tankD + bowlD * 0.45);
  const bowlH = bowlTop - pedestalH;
  f.add(ellipticLathe(bowlProfile(bowlH, 0.1, 0.55), w / 2 - 1, bowlD / 2 - 1), m.ceramic, 0, pedestalH, tankD + bowlD / 2);
  if (!twoPiece) {
    // Closed seat + lid on the bowl rim.
    f.add(ellipticLathe([[0, 0], [1, 0], [1, 22], [0.96, 34], [0, 36]], w / 2 - 6, bowlD / 2 - 8), m.ceramic, 0, bowlTop, tankD + bowlD / 2 + 4);
  }
}

function tub(part: PartSpec, ctx: DetailContext, f: Frame): void {
  const { w, h, d } = f;
  const m = ctx.materials;
  if (named(part, "freestanding")) {
    // Oval shell on a slim plinth; inner basin with water.
    f.add(ellipticLathe([[0, 0], [0.86, 0], [0.97, h * 0.7], [1, h], [0.93, h], [0.9, h * 0.5], [0.72, h * 0.12], [0, h * 0.1]], w / 2, d / 2), m.ceramic, 0, 0, d / 2);
    f.add(ellipticLathe([[0, 0], [0.9, 0], [0.9, 1], [0, 1]], (w / 2) * 0.9, (d / 2) * 0.9), m.water, 0, h * 0.72, d / 2).castShadow = false;
    return;
  }
  // Alcove / drop-in: rectangular deck with an oval basin cut in, apron to the front.
  const rim = Math.min(90, Math.min(w, d) * 0.12);
  const deck = roundedRectShape(w, d, 30);
  const hole = new THREE.Path();
  hole.absellipse(0, 0, w / 2 - rim, d / 2 - rim, 0, Math.PI * 2, false, 0);
  deck.holes.push(hole);
  f.add(extrudeUp(deck, h), m.ceramic, 0, 0, d / 2);
  f.add(ellipticLathe(bowlProfile(h * 0.82, 0.02, 0.7), w / 2 - rim, d / 2 - rim), m.ceramic, 0, h * 0.16, d / 2);
  f.add(ellipticLathe([[0, 0], [0.97, 0], [0.97, 1], [0, 1]], w / 2 - rim, d / 2 - rim), m.water, 0, h * 0.74, d / 2).castShadow = false;
}

function basin(part: PartSpec, f: Frame, ctx: DetailContext): void {
  const { w, h } = f;
  // The bowl sits in front of the faucet deck; a wall-hung basin carries its own deck.
  const deck = ctx.deckMm ?? 0;
  const d = f.d - deck;
  const z = deck + d / 2;
  f.add(ellipticLathe(bowlProfile(h, 0.1, 0.6), w / 2, d / 2), ctx.materials.ceramic, 0, 0, z);
  f.add(new THREE.CylinderGeometry(Math.min(w, d) * 0.05, Math.min(w, d) * 0.05, 2, 20), ctx.materials.dark, 0, h * 0.09, z).castShadow = false;
  if (deck > 0 && (part.productName ?? "").toLowerCase().includes("wall-mount")) f.box(w, h * 0.3, deck, ctx.materials.ceramic, 0, h * 0.7, 0, 6);
}

/** Door face in the front `d` band: panel behind a pull that ends flush with the box front. */
function doorPanel(part: PartSpec, ctx: DetailContext, f: Frame, x: number, width: number, height: number, y: number): void {
  const { d } = f;
  const m = ctx.materials;
  const pd = Math.min(14, d * 0.4);
  const t = Math.min(18, d - pd);
  f.box(width - 4, height, t, m.wood(part), x, y, d - pd - t, 4);
  const ph = Math.min(160, height * 0.35);
  const pullX = x + (x <= 0 ? width / 2 - 45 : -width / 2 + 45);
  f.box(12, ph, pd, m.metal(part), pullX, y + height * 0.5 - ph / 2, d - pd, 5);
}

function vanity(part: PartSpec, ctx: DetailContext, f: Frame): void {
  const { w, h, d } = f;
  const m = ctx.materials;
  switch (part.part) {
    case "cabinet": {
      const separateDoors = has(ctx, "door");
      const kick = separateDoors || has(ctx, "kickboard") ? 0 : Math.min(90, h * 0.1);
      const front = separateDoors ? 0 : 32;
      // A basin sunk into the cabinet needs an open top: carcass stops at the basin bottom,
      // side and back panels run full height.
      const cabinetBottom = part.positionMm.y - h / 2;
      const basinBottom = Math.min(h, ...ctx.siblings.filter((s) => s.part === "basin").map((b) => b.positionMm.y - partSize(b).h / 2 - cabinetBottom));
      if (kick > 0) f.box(w - 40, kick, d - front - 40, m.dark, 0, 0, 0);
      f.box(w, Math.max(0, basinBottom - kick), d - front, m.wood(part), 0, kick, 0, 6);
      if (basinBottom < h) {
        for (const s of [-1, 1]) f.box(18, h - basinBottom, d - front, m.wood(part), s * (w / 2 - 9), basinBottom, 0);
        f.box(w, h - basinBottom, 18, m.wood(part), 0, basinBottom, 0);
        f.box(w, h - basinBottom, 18, m.wood(part), 0, basinBottom, d - front - 18);
      }
      if (!separateDoors) {
        const doors = w >= 600 ? 2 : 1;
        const dw = w / doors;
        for (let i = 0; i < doors; i++) doorPanel(part, ctx, f, -w / 2 + dw * (i + 0.5), dw, h - kick - 16, kick + 8);
      }
      return;
    }
    case "door":
      doorPanel(part, ctx, f, 0, w, h, 0);
      return;
    case "kickboard":
      f.box(w, h, d, m.dark, 0, 0, 0);
      return;
    case "top": {
      // Slab with oval cut-outs over this vanity's own basin parts.
      const shape = roundedRectShape(w, d, 8);
      const rot = -part.rotationY;
      for (const b of ctx.siblings.filter((s) => s.part === "basin")) {
        const bs = partSize(b);
        const dx = b.positionMm.x - part.positionMm.x;
        const dz = b.positionMm.z - part.positionMm.z;
        const lx = dx * Math.cos(rot) + dz * Math.sin(rot);
        const lz = -dx * Math.sin(rot) + dz * Math.cos(rot);
        const rx = Math.min(bs.w * 0.44, w / 2 - Math.abs(lx) - 20);
        const rz = Math.min(bs.d * 0.42, d / 2 - Math.abs(lz) - 20);
        if (rx < 40 || rz < 40) continue;
        const hole = new THREE.Path();
        hole.absellipse(lx, -lz, rx, rz, 0, Math.PI * 2, false, 0);
        shape.holes.push(hole);
      }
      f.add(extrudeUp(shape, h), m.counter, 0, 0, d / 2);
      return;
    }
    case "basin":
      basin(part, f, ctx);
      return;
  }
}

function faucet(part: PartSpec, ctx: DetailContext, f: Frame): void {
  const { w, h, d } = f;
  const metal = ctx.materials.metal(part);
  const r = Math.min(w, d) / 2;
  // A whole-faucet box ("body") stands at its back edge (on the basin deck, T-028).
  const wholeBox = part.shape.shape === "box" && part.part === "body";
  if (part.shape.shape === "box" && !wholeBox) {
    // Horizontal spout: body end at the wall side, tip curving down at the front.
    const rr = Math.min(h, w) * 0.38;
    f.add(tube([[0, h - rr, rr], [0, h - rr, d * 0.55], [0, h * 0.5, d - rr * 1.2], [0, rr, d - rr]], rr), metal, 0, 0, 0);
    return;
  }
  if (part.part === "handle") {
    f.add(new THREE.CylinderGeometry(r * 0.7, r * 0.85, h * 0.35, 20), metal, 0, h * 0.175, d / 2);
    f.add(new THREE.CylinderGeometry(r * 0.25, r * 0.3, h * 0.65, 12), metal, 0, h * 0.35 + h * 0.325, d / 2);
    return;
  }
  // Body / spout column: flared base, tapered column, gooseneck tip into the room.
  const cz = wholeBox ? r : d / 2;
  f.add(new THREE.CylinderGeometry(r * 0.8, r, h * 0.08, 24), metal, 0, h * 0.04, cz);
  f.add(new THREE.CylinderGeometry(r * 0.42, r * 0.55, h * 0.72, 20), metal, 0, h * 0.08 + h * 0.36, cz);
  if (part.part === "body" && !wholeBox) {
    f.box(r * 0.4, h * 0.08, r * 0.9, metal, 0, h * 0.72, 0, 2);
    return;
  }
  const tr = r * 0.3;
  f.add(tube([[0, h * 0.78, cz], [0, h - tr, cz + r * 0.2], [0, h * 0.86, d - tr]], tr), metal, 0, 0, 0);
}

function shower(part: PartSpec, ctx: DetailContext, f: Frame): void {
  const { w, h, d } = f;
  const metal = ctx.materials.metal(part);
  if (part.part === "arm") {
    const rr = Math.min(w, h) / 2;
    f.add(tube([[0, h / 2, 0], [0, h / 2, d * 0.7], [0, h / 2, d]], rr * 0.9), metal, 0, 0, 0);
    return;
  }
  const r = Math.min(w, d) / 2;
  f.add(new THREE.CylinderGeometry(r * 0.2, r * 0.2, h * 0.6, 16), metal, 0, h * 0.7, d / 2);
  f.add(new THREE.CylinderGeometry(r, r * 0.96, h * 0.4, 40), metal, 0, h * 0.2, d / 2);
  f.add(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 1, 40), ctx.materials.dark, 0, 0.5, d / 2).castShadow = false;
}

function accessory(part: PartSpec, ctx: DetailContext, f: Frame): void {
  const { w, h, d } = f;
  const metal = ctx.materials.metal(part);
  if (named(part, "mirrored cabinet")) {
    f.box(w, h, d - 6, ctx.materials.wood(part), 0, 0, 0, 4);
    f.box(w - 20, h - 20, 6, ctx.materials.mirror, 0, 10, d - 6);
    return;
  }
  if (named(part, "hook")) {
    f.box(w * 0.8, h * 0.5, d * 0.2, metal, 0, h * 0.4, 0, 3);
    f.add(tube([[0, h * 0.6, d * 0.2], [0, h * 0.55, d * 0.8], [0, h * 0.85, d - 4]], Math.min(w, h) * 0.08), metal, 0, 0, 0);
    return;
  }
  const post = Math.min(h, d) * 0.22;
  if (w >= h * 1.5) {
    // Towel bar: two wall posts and a round bar at the front.
    for (const s of [-1, 1]) {
      f.add(new THREE.CylinderGeometry(post * 1.3, post * 1.3, d * 0.12, 20), metal, s * (w / 2 - post * 1.6), h / 2, d * 0.06).rotation.x = Math.PI / 2;
      f.add(new THREE.CylinderGeometry(post * 0.7, post * 0.7, d * 0.8, 16), metal, s * (w / 2 - post * 1.6), h / 2, d * 0.5).rotation.x = Math.PI / 2;
    }
    f.add(new THREE.CylinderGeometry(post * 0.55, post * 0.55, w - post * 2, 16), metal, 0, h / 2, d - post * 0.7).rotation.z = Math.PI / 2;
    return;
  }
  // Ring / holder: wall plate + torus.
  f.add(new THREE.CylinderGeometry(w * 0.2, w * 0.2, d * 0.15, 24), metal, 0, h * 0.8, d * 0.075).rotation.x = Math.PI / 2;
  const ringR = Math.min(w / 2, (h * 0.8) / 2) * 0.82;
  f.add(new THREE.TorusGeometry(ringR, ringR * 0.09, 12, 48), metal, 0, h * 0.8 - ringR, d * 0.55);
}

/** Detailed mesh for a fixture part, centred like the primitive it replaces, or null. */
export function detailedPart(part: PartSpec, ctx: DetailContext): THREE.Object3D | null {
  if (part.fixtureClass === "room") return null;
  const { w, h, d } = partSize(part);
  const f = new Frame(w, h, d);
  switch (part.fixtureClass) {
    case "toilet": toilet(part, ctx, f); break;
    case "tub": tub(part, ctx, f); break;
    case "basin": basin(part, f, ctx); break;
    case "vanity": vanity(part, ctx, f); break;
    case "faucet": faucet(part, ctx, f); break;
    case "shower": shower(part, ctx, f); break;
    case "accessory": accessory(part, ctx, f); break;
    default: return null;
  }
  if (f.group.children.length === 0) return null;
  const outer = new THREE.Group();
  outer.add(f.group);
  // Guarantee the fit: curves (tubes, lathes) may overshoot a millimetre or two, so scale
  // about the centre until the mesh sits inside the primitive box on every axis.
  outer.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(outer);
  const fit = (half: number, lo: number, hi: number): number => Math.min(1, half / Math.max(Math.abs(lo), Math.abs(hi), 1e-6));
  outer.scale.set(fit(w / 2, box.min.x, box.max.x), fit(h / 2, box.min.y, box.max.y), fit(d / 2, box.min.z, box.max.z));
  return outer;
}
