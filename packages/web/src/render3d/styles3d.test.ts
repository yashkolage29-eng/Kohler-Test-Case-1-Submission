// T-027: basin/faucet counter supports and style-preset décor models.
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { COUNTER_HEIGHT_MM, DECOR_TYPES, STYLE_PRESETS, loadCatalog, mountElevationMm, type SKU } from "@kolher/engine";
import { buildSupports } from "./room3d.js";
import { decorModelUrl } from "./mount.js";
import { finishHex, type PartSpec, type SceneSpec } from "./sceneSpec.js";

const { state } = loadCatalog();
const sku = (id: string): SKU => state.skus.find((s) => s.model_id === id)!;

/** A fixture's parts placed on the back wall (rotation 0), front edge at z = depth. */
function placed(s: SKU, x: number): PartSpec[] {
  return s.geometry_descriptor.primitives.map((prim) => {
    const k = prim.kind;
    const size = k.shape === "box" ? k.sizeMm : { w: k.radiusMm * 2, h: k.hMm, d: k.radiusMm * 2 };
    return {
      modelId: s.model_id, fixtureClass: s.fixture_class, part: prim.part, shape: k,
      positionMm: { x: x + prim.offsetMm.x + size.w / 2, y: mountElevationMm(s) + prim.offsetMm.y + size.h / 2, z: prim.offsetMm.z + size.d / 2 },
      rotationY: 0, colorHex: finishHex(s.finish_options[0]), productName: s.name,
    };
  });
}

describe("buildSupports", () => {
  it("adds a counter under undercounter and vessel basins, none for wall-mount basins or deck faucets", () => {
    const spec: SceneSpec = { parts: [...placed(sku("K-2210IN-0"), 0), ...placed(sku("K-25316IN-0"), 1000), ...placed(sku("K-25317IN-0"), 2000), ...placed(sku("K-10270-4-CP"), 3000)], openings: [] };
    const group = buildSupports(spec);
    expect(group.children.map((c) => c.name).sort()).toEqual(["support/K-2210IN-0", "support/K-25316IN-0"]);
    for (const child of group.children) {
      const box = new THREE.Box3().setFromObject(child);
      expect(box.max.y, child.name).toBeCloseTo(COUNTER_HEIGHT_MM, 3);
      // Back reaches the wall face (z = 0) and at most the margin into the wall.
      expect(box.min.z, child.name).toBeLessThanOrEqual(0);
      expect(box.min.z, child.name).toBeGreaterThanOrEqual(-60.01);
    }
  });

  it("the undercounter slab has a bowl cut-out; the vessel slab is solid", () => {
    const spec: SceneSpec = { parts: [...placed(sku("K-2210IN-0"), 0), ...placed(sku("K-25316IN-0"), 1000)], openings: [] };
    const [under, vessel] = ["support/K-2210IN-0", "support/K-25316IN-0"].map((n) => buildSupports(spec).getObjectByName(n) as THREE.Mesh);
    const tris = (m: THREE.Mesh) => (m.geometry.index?.count ?? m.geometry.getAttribute("position").count) / 3;
    expect(tris(under)).toBeGreaterThan(tris(vessel) * 4);
  });

  it("vanity-only plans get no support", () => {
    expect(buildSupports({ parts: placed(sku("K-2604-F69"), 0), openings: [] }).children).toHaveLength(0);
  });
});

describe("decorModelUrl", () => {
  it("every mapped model file is bundled", () => {
    for (const type of DECOR_TYPES) {
      for (const preset of [undefined, ...STYLE_PRESETS]) {
        const url = decorModelUrl(type, preset);
        if (url) expect(existsSync(`public${url}`), `${type}/${preset}`).toBe(true);
      }
    }
  });

  it("varies by style and falls back to the default model", () => {
    expect(decorModelUrl("plant", "japanese-zen")).toBe("/models/plant-bonsai.glb");
    expect(decorModelUrl("plant")).toBe("/models/plant-floor.glb");
    expect(decorModelUrl("mirror", "classic-luxury")).toBe("/models/mirror-ornate.glb");
    expect(decorModelUrl("mirror", "coastal")).toBeUndefined();
    expect(decorModelUrl("chandelier", "classic-luxury")).toBe("/models/chandelier.glb");
  });
});
