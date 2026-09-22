// T-026c: detail meshes are presentation only and must stay inside the catalog
// primitive box they replace (the engine AABB remains the authority).
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { loadCatalog, type SKU } from "@kolher/engine";
import { basinDeckMm, detailedPart, partSize } from "./detail.js";
import { detailMaterials } from "./room3d.js";
import { buildSceneGroup } from "./build3d.js";
import { buildSceneSpec, finishHex, type PartSpec } from "./sceneSpec.js";
import { demoGeometry } from "./fixture.js";

const TOLERANCE_MM = 1.5;

/** Catalog primitives as unrotated PartSpecs (catalog x/y/z = along/up/depth). */
function skuParts(sku: SKU): PartSpec[] {
  const finish = sku.finish_options[0];
  return sku.geometry_descriptor.primitives.map((prim) => {
    const k = prim.kind;
    const size = k.shape === "box" ? k.sizeMm : { w: k.radiusMm * 2, h: k.hMm, d: k.radiusMm * 2 };
    const center = k.shape === "box"
      ? { x: prim.offsetMm.x + size.w / 2, z: prim.offsetMm.z + size.d / 2 }
      : { x: prim.offsetMm.x, z: prim.offsetMm.z };
    return {
      modelId: sku.model_id,
      fixtureClass: sku.fixture_class,
      part: prim.part,
      shape: k,
      positionMm: { x: center.x, y: prim.offsetMm.y + size.h / 2, z: center.z },
      rotationY: 0,
      colorHex: prim.finishable ? finishHex(finish) : "#F6F7F8",
      finishId: prim.finishable ? finish : undefined,
      productName: sku.name,
    };
  });
}

describe("detailedPart", () => {
  const materials = detailMaterials(finishHex, () => undefined);
  const { state } = loadCatalog();

  it("every catalog primitive gets a detail mesh that fits inside its box", () => {
    let detailed = 0;
    for (const sku of state.skus) {
      const parts = skuParts(sku);
      for (const part of parts) {
        const object = detailedPart(part, { siblings: parts.filter((p) => p !== part), materials });
        expect(object, `${sku.model_id}/${part.part}`).not.toBeNull();
        detailed++;
        object!.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(object!);
        const { w, h, d } = partSize(part);
        const label = `${sku.model_id} ${sku.name} / ${part.part}`;
        expect(box.min.x, label).toBeGreaterThanOrEqual(-w / 2 - TOLERANCE_MM);
        expect(box.max.x, label).toBeLessThanOrEqual(w / 2 + TOLERANCE_MM);
        expect(box.min.y, label).toBeGreaterThanOrEqual(-h / 2 - TOLERANCE_MM);
        expect(box.max.y, label).toBeLessThanOrEqual(h / 2 + TOLERANCE_MM);
        expect(box.min.z, label).toBeGreaterThanOrEqual(-d / 2 - TOLERANCE_MM);
        expect(box.max.z, label).toBeLessThanOrEqual(d / 2 + TOLERANCE_MM);
      }
    }
    expect(detailed).toBeGreaterThan(40);
  });

  it("a basin with a deck faucet keeps a back deck and still fits its box (T-028)", () => {
    const sku = (id: string) => state.skus.find((s) => s.model_id === id)!;
    for (const [basinId, faucetId] of [["K-2210IN-0", "K-45800-4-CP"], ["K-25318IN-0", "K-22535IN-4AND-CP"], ["K-25317IN-0", "K-14406-4-CP"]]) {
      const [basin] = skuParts(sku(basinId));
      // Faucet centred along the basin, flush to the same wall — how the engine mounts it.
      const faucet = skuParts(sku(faucetId)).map((p) => ({ ...p, positionMm: { ...p.positionMm, x: p.positionMm.x + basin.positionMm.x } }));
      const deckMm = basinDeckMm(basin, [basin, ...faucet]);
      expect(deckMm, basinId).toBeGreaterThan(40);
      expect(basinDeckMm(basin, [basin])).toBe(0);
      const object = detailedPart(basin, { siblings: [], materials, deckMm })!;
      object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(object);
      const { w, h, d } = partSize(basin);
      expect(box.min.x).toBeGreaterThanOrEqual(-w / 2 - TOLERANCE_MM);
      expect(box.max.x).toBeLessThanOrEqual(w / 2 + TOLERANCE_MM);
      expect(box.min.y).toBeGreaterThanOrEqual(-h / 2 - TOLERANCE_MM);
      expect(box.max.y).toBeLessThanOrEqual(h / 2 + TOLERANCE_MM);
      expect(box.min.z).toBeGreaterThanOrEqual(-d / 2 - TOLERANCE_MM);
      expect(box.max.z).toBeLessThanOrEqual(d / 2 + TOLERANCE_MM);
    }
  });

  it("room shell parts keep their primitives", () => {
    const { geometry, skus } = demoGeometry();
    const spec = buildSceneSpec(geometry, skus);
    const room = spec.parts.find((p) => p.fixtureClass === "room")!;
    expect(detailedPart(room, { siblings: [], materials })).toBeNull();
  });

  it("the detailed scene keeps one positioned child per spec part and is deterministic", () => {
    const { geometry, skus } = demoGeometry();
    const spec = buildSceneSpec(geometry, skus);
    const fingerprint = (group: THREE.Group): string => group.children.map((child) => {
      const box = new THREE.Box3().setFromObject(child);
      return [child.name, child.position.toArray().map(Math.round).join(","), box.min.toArray().map(Math.round).join(","), box.max.toArray().map(Math.round).join(",")].join("|");
    }).join("\n");
    const g1 = buildSceneGroup(spec);
    expect(g1.children).toHaveLength(spec.parts.length);
    spec.parts.forEach((part, i) => expect(g1.children[i].name).toBe(`${part.modelId}/${part.part}`));
    expect(fingerprint(g1)).toBe(fingerprint(buildSceneGroup(buildSceneSpec(geometry, skus))));
  });
});

describe("black ceramic (T-042)", () => {
  const materials = detailMaterials(finishHex, () => undefined);
  const { state } = loadCatalog();
  const meshMaterials = (id: string): Set<THREE.Material> => {
    const sku = state.skus.find((s) => s.model_id === id)!;
    const parts = skuParts(sku);
    const out = new Set<THREE.Material>();
    detailedPart(parts[0], { siblings: parts, materials })?.traverse((c) => { if (c instanceof THREE.Mesh) out.add(c.material as THREE.Material); });
    return out;
  };

  it("a black vessel basin renders in dark ceramic, a white one in white", () => {
    expect(meshMaterials("K-28784IN-7").has(materials.darkCeramic)).toBe(true);
    expect(meshMaterials("K-28784IN-7").has(materials.ceramic)).toBe(false);
    expect(meshMaterials("K-25318IN-0").has(materials.ceramic)).toBe(true);
  });
});
