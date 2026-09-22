// T-015 nonblank scene-graph smoke test. WebGL pixel rendering needs a real GL
// context (absent in CI), so the honest CI-equivalent smoke is: the built scene
// graph is nonempty, every mesh has nondegenerate geometry and a resolved material
// color, and repeated builds are structurally identical. Visual inspection happens
// in the dev server (main.ts demo mount).
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { placeDecor, offlineDecorProposal, type PlacedDecor } from "@kolher/engine";
import { buildPlacedDecor, buildSceneGroup } from "./build3d.js";
import { buildSceneSpec } from "./sceneSpec.js";
import { demoGeometry } from "./fixture.js";

function graphFingerprint(group: THREE.Group): string {
  return group.children
    .map((child) => {
      const mesh = child as THREE.Mesh;
      const geo = mesh.geometry as THREE.BoxGeometry;
      const mat = mesh.material as THREE.MeshPhysicalMaterial;
      return [
        mesh.name,
        mesh.position.toArray().join(","),
        mesh.rotation.y,
        JSON.stringify(geo.parameters),
        mat.color.getHexString(),
        mat.roughness ?? 0,
        mat.metalness ?? 0,
      ].join("|");
    })
    .join("\n");
}

describe("buildSceneGroup (nonblank scene-graph smoke)", () => {
  it("produces a nonempty, fully-materialized scene graph, equal across builds", () => {
    const { geometry, skus } = demoGeometry();
    const spec = buildSceneSpec(geometry, skus);
    const g1 = buildSceneGroup(spec, { detail: false });
    const g2 = buildSceneGroup(buildSceneSpec(geometry, skus), { detail: false });
    expect(g1.children.length).toBeGreaterThan(0);
    expect(g1.children.length).toBe(spec.parts.length); // décor is built separately (buildPlacedDecor)
    for (const child of g1.children) {
      const mesh = child as THREE.Mesh;
      expect(mesh.geometry.index).not.toBeNull(); // nondegenerate geometry
      expect((mesh.material as THREE.MeshPhysicalMaterial).color.getHexString()).toMatch(/^[0-9a-f]{6}$/);
    }
    expect(graphFingerprint(g1)).toBe(graphFingerprint(g2));
  });
});

describe("buildPlacedDecor (AI décor meshes)", () => {
  it("builds one tagged group per placed item at its position with at most 3 point lights", () => {
    const { geometry } = demoGeometry();
    const placed = placeDecor(offlineDecorProposal("warm spa with plants, candles and a brass pendant"), geometry);
    expect(placed.length).toBeGreaterThan(3);
    const root = buildPlacedDecor(placed);
    expect(root.children).toHaveLength(placed.length);
    placed.forEach((item, i) => {
      const group = root.children[i];
      expect(group.userData.decorId).toBe(item.id);
      expect(group.position.toArray()).toEqual([item.positionMm.x, item.positionMm.y, item.positionMm.z]);
      expect(group.rotation.y).toBeCloseTo(item.rotationY);
      expect(group.children.length).toBeGreaterThan(0);
    });
    const lights: THREE.PointLight[] = [];
    root.traverse((child) => { if (child instanceof THREE.PointLight) lights.push(child); });
    expect(lights.length).toBe(placed.filter((item) => item.light).length);
    expect(lights.length).toBeLessThanOrEqual(3);
  });

  it("covers every décor type, sits meshes inside the item's box and caps lights at 4", () => {
    const types: PlacedDecor["type"][] = ["pendant", "sconce", "backlit-mirror", "mirror", "art", "plant", "small-plant", "rug", "towel", "vase", "candles", "shelf", "stool",
      "towel-ladder", "cabinet", "side-table", "floor-mirror", "bath-mat", "tub-tray", "niche-shelf", "laundry-basket", "floor-lamp", "led-strip", "sculpture"];
    const items: PlacedDecor[] = types.map((type, i) => ({
      id: `decor-${i}-${type}`, type, mount: "floor", positionMm: { x: 0, y: 500, z: 0 }, rotationY: 0,
      sizeMm: { w: 400, h: 1000, d: 300 }, color: "#8b5e3c", metal: "chrome",
      ...(i < 5 ? { light: { color: "#ffcf9a", intensity: 1 } } : {}),
    }));
    const root = buildPlacedDecor(items);
    expect(root.children).toHaveLength(types.length);
    let lights = 0;
    root.traverse((child) => { if (child instanceof THREE.PointLight) lights++; });
    expect(lights).toBe(4);
    for (const group of root.children) {
      const box = new THREE.Box3().setFromObject(group);
      expect(box.isEmpty()).toBe(false);
      expect(box.min.y).toBeGreaterThanOrEqual(-1); // nothing below the item's floor (y − h/2 = 0)
      expect(box.max.y).toBeLessThanOrEqual(1100);
    }
  });
});
