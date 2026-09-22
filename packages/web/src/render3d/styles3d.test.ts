// T-027: basin/faucet counter supports and style-preset décor models.
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { COUNTER_HEIGHT_MM, DECOR_TYPES, STYLE_PRESETS, STYLES, loadCatalog, mountElevationMm, type SKU } from "@kolher/engine";
import { buildSupports, dressRoomShell, wallHex } from "./room3d.js";
import { decorModelUrl } from "./mount.js";
import { buildSceneSpec, finishHex, type PartSpec, type SceneSpec } from "./sceneSpec.js";

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
    const slabs = group.children.filter((c) => c.name.startsWith("support/"));
    expect(slabs.map((c) => c.name).sort()).toEqual(["support/K-2210IN-0", "support/K-25316IN-0"]);
    for (const child of slabs) {
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

  it("every counter stands on a cabinet down to the floor, so no basin floats (T-034)", () => {
    const spec: SceneSpec = { parts: [...placed(sku("K-2210IN-0"), 0), ...placed(sku("K-25316IN-0"), 1000)], openings: [] };
    const group = buildSupports(spec);
    for (const id of ["K-2210IN-0", "K-25316IN-0"]) {
      const cabinet = group.getObjectByName(`support-cabinet/${id}`);
      expect(cabinet, id).toBeDefined();
      const box = new THREE.Box3().setFromObject(cabinet!);
      expect(box.min.y, id).toBeCloseTo(0, 3);
      expect(box.max.y, id).toBeCloseTo(COUNTER_HEIGHT_MM - 40, 3);
      const slab = new THREE.Box3().setFromObject(group.getObjectByName(`support/${id}`)!);
      expect(box.min.x).toBeGreaterThanOrEqual(slab.min.x);
      expect(box.max.x).toBeLessThanOrEqual(slab.max.x);
    }
  });

  it("a wall-mount basin gets a visible waste trap into the wall instead of a counter (T-034)", () => {
    const group = buildSupports({ parts: placed(sku("K-25317IN-0"), 0), openings: [] });
    expect(group.getObjectByName("support/K-25317IN-0")).toBeUndefined();
    const trap = group.getObjectByName("support-trap/K-25317IN-0");
    expect(trap).toBeDefined();
    const box = new THREE.Box3().setFromObject(trap!);
    const bowlBottom = Math.min(...placed(sku("K-25317IN-0"), 0).map((p) => p.positionMm.y - (p.shape.shape === "box" ? p.shape.sizeMm.h : p.shape.hMm) / 2));
    expect(box.max.y).toBeCloseTo(bowlBottom, 0);
    expect(box.min.z).toBeLessThanOrEqual(0); // reaches the wall
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

  it("custom tastes (no preset) pick lights by the décor metal instead of the plain lamp (T-034)", () => {
    expect(decorModelUrl("pendant", undefined, "black")).toBe("/models/pendant-industrial.glb");
    expect(decorModelUrl("pendant", undefined, "brass")).toBe("/models/pendant-lantern.glb");
    expect(decorModelUrl("pendant", undefined, "chrome")).toBe("/models/pendant-modern.glb");
    expect(decorModelUrl("pendant", undefined, "nickel")).toBe("/models/pendant-modern.glb");
    expect(decorModelUrl("sconce", undefined, "black")).toBe("/models/sconce-industrial.glb");
    // A preset still wins over the metal.
    expect(decorModelUrl("pendant", "japanese-zen", "black")).toBe("/models/pendant-lantern.glb");
    for (const metal of ["chrome", "brass", "black", "nickel"] as const) {
      const url = decorModelUrl("pendant", undefined, metal);
      expect(url && existsSync(`public${url}`), metal).toBe(true);
    }
  });
});

describe("faucet on a vanity (T-032/T-034)", () => {
  it("sits on the vanity top, not sunk into it", async () => {
    const { initialState, buildRoomPreview, buildConfirmedInput, reduceState, solveConfirmed, selectedPlan } = await import("../store.js");
    const { buildRenderGeometry } = await import("@kolher/engine");
    let s = initialState();
    const preview = buildRoomPreview(s.room);
    if (!preview.ok) throw new Error(preview.message);
    s = reduceState(reduceState(s, { type: "PREVIEW_ROOM_SUCCESS", preview: preview.preview }), { type: "CONFIRM_ROOM" });
    const result = solveConfirmed(s, state);
    if (!result.ok) throw new Error(result.message);
    s = reduceState(s, { type: "SOLVE_RESULT", output: result.output });
    const input = buildConfirmedInput(s);
    if (!input.ok) throw new Error(input.message);
    const spec = buildSceneSpec(buildRenderGeometry(selectedPlan(s)!, input.input), state.skus);
    const top = spec.parts.find((p) => p.fixtureClass === "vanity" && p.part === "top");
    const faucet = spec.parts.filter((p) => p.fixtureClass === "faucet");
    expect(top).toBeDefined();
    expect(faucet.length).toBeGreaterThan(0);
    const topY = top!.positionMm.y + (top!.shape.shape === "box" ? top!.shape.sizeMm.h : top!.shape.hMm) / 2;
    const bottom = Math.min(...faucet.map((p) => p.positionMm.y - (p.shape.shape === "box" ? p.shape.sizeMm.h : p.shape.hMm) / 2));
    expect(bottom).toBeCloseTo(topY, 0);
  });
});

describe("dark themes (T-039)", () => {
  const lightness = (hex: string): number => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).l;
  const DARK = ["#141414", "#2b2b2e", "#c9a45c", "#3a3a3c"];

  it("a dark palette paints the walls dark; a light one keeps them light", () => {
    expect(lightness(wallHex({ palette: DARK }))).toBeLessThan(0.3);
    expect(lightness(wallHex({ palette: ["#f4f3f0", "#d9d6d0", "#8c8c88", "#2e2e2e"] }))).toBeGreaterThan(0.6);
    expect(lightness(wallHex({ palette: STYLES["industrial-loft"].palette }))).toBeGreaterThan(0.6);
  });

  it("the Dark Luxury preset has a dark floor and dark walls", () => {
    const def = STYLES["dark-luxury"];
    expect(def.floor).toBe("granite");
    expect(lightness(wallHex({ palette: def.palette, preset: "dark-luxury" }))).toBeLessThan(0.3);
  });

  it("a preset's own palette paints the walls, whatever palette came with it", () => {
    const group = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2400, 2400, 100), new THREE.MeshPhysicalMaterial());
    wall.name = "room/wall-top";
    group.add(wall);
    dressRoomShell(group, { preset: "dark-luxury", palette: ["#f4efe6", "#e0d6c6"] });
    expect(lightness(`#${(wall.material as THREE.MeshPhysicalMaterial).color.getHexString()}`)).toBeLessThan(0.3);
  });

  it("a dark custom palette without a preset gets a dark floor", () => {
    const shell = (palette: string[]) => {
      const group = new THREE.Group();
      const floor = new THREE.Mesh(new THREE.BoxGeometry(2400, 10, 1800), new THREE.MeshPhysicalMaterial());
      floor.name = "room/floor";
      group.add(floor);
      dressRoomShell(group, { palette });
      return lightness(`#${(floor.material as THREE.MeshPhysicalMaterial).color.getHexString()}`);
    };
    expect(shell(DARK)).toBeLessThan(0.4);
    expect(shell(["#f4f3f0", "#d9d6d0"])).toBeGreaterThan(0.9);
  });
});

describe("accent wall (T-043)", () => {
  const shell = (style: Parameters<typeof dressRoomShell>[1], accentNear?: { x: number; z: number }) => {
    const group = new THREE.Group();
    for (const [name, x, z] of [["room/wall-top", 1200, -50], ["room/wall-left", -50, 900], ["room/wall-right", 2450, 900]] as const) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2400, 2400, 100), new THREE.MeshPhysicalMaterial());
      wall.name = name;
      wall.position.set(x, 1200, z);
      group.add(wall);
    }
    dressRoomShell(group, style, () => undefined, accentNear);
    return Object.fromEntries(group.children.map((c) => [c.name, `#${((c as THREE.Mesh).material as THREE.MeshPhysicalMaterial).color.getHexString()}`]));
  };

  it("the wall nearest the shower gets the style's accent; the others keep the paint", () => {
    const colours = shell({ preset: "dark-luxury", palette: STYLES["dark-luxury"].palette }, { x: 100, z: 900 });
    expect(colours["room/wall-left"]).toBe("#55575a"); // granite fallback colour until the texture loads
    expect(colours["room/wall-top"]).not.toBe("#55575a");
    expect(colours["room/wall-right"]).toBe(colours["room/wall-top"]);
  });

  it("no accent without a preset or a wet fixture", () => {
    const plain = shell({ palette: ["#f4f3f0", "#d9d6d0"] }, { x: 100, z: 900 });
    expect(new Set(Object.values(plain)).size).toBe(1);
    const noWet = shell({ preset: "dark-luxury", palette: STYLES["dark-luxury"].palette });
    expect(new Set(Object.values(noWet)).size).toBe(1);
  });
});
