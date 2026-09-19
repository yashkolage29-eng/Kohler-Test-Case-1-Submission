// T-015 render3d spec tests: scene-graph equality, finish mapping, descriptor
// provenance ("every visible fixture maps to a BOM/catalog descriptor"), descriptor
// sensitivity, opening gaps, and fallback behavior.
import { describe, expect, it } from "vitest";
import type { SKU } from "@kolher/engine";
import { mountElevationMm } from "@kolher/engine";
import { buildSceneSpec, finishHex, wallSolidRanges, WALL_HEIGHT_MM, DOOR_HEAD_MM } from "./sceneSpec.js";
import { demoGeometry } from "./fixture.js";

describe("finishHex", () => {
  it("maps catalog finish ids to catalog swatch hex", () => {
    expect(finishHex("chrome")).toBe("#C9D1D4");
    expect(finishHex("white")).toBe("#F6F7F8");
    expect(finishHex("matte_black")).toBe("#23272A");
  });
  it("falls back to ceramic white for absent/unknown finishes", () => {
    expect(finishHex(undefined)).toBe("#F6F7F8");
    expect(finishHex("not_a_finish")).toBe("#F6F7F8");
  });
});

describe("buildSceneSpec", () => {
  it("is deterministic — two builds from the same inputs are deeply equal", () => {
    const { geometry, skus } = demoGeometry();
    expect(JSON.stringify(buildSceneSpec(geometry, skus))).toBe(
      JSON.stringify(buildSceneSpec(geometry, skus)),
    );
  });

  it("maps every placed fixture to its catalog descriptor parts (no invented shapes)", () => {
    const { geometry, skus } = demoGeometry();
    const spec = buildSceneSpec(geometry, skus);
    expect(geometry.fixtures.length).toBeGreaterThan(0);
    for (const fixture of geometry.fixtures) {
      const sku = skus.find((s) => s.model_id === fixture.modelId);
      expect(sku, `fixture ${fixture.modelId} in catalog`).toBeDefined();
      const parts = spec.parts.filter((p) => p.modelId === fixture.modelId);
      expect(parts.map((p) => p.part)).toEqual(sku!.geometry_descriptor.primitives.map((pr) => pr.part));
    }
  });

  it("changes the rendered primitives when a descriptor changes", () => {
    const { geometry, skus } = demoGeometry();
    const first = buildSceneSpec(geometry, skus);
    const placed = geometry.fixtures[0]!.modelId;
    const target = skus.find((s) => s.model_id === placed)!;
    const mutated: SKU[] = skus.map((s) =>
      s.model_id === target.model_id
        ? {
            ...s,
            geometry_descriptor: {
              ...s.geometry_descriptor,
              primitives: [
                ...s.geometry_descriptor.primitives,
                {
                  part: "extra_probe",
                  kind: { shape: "box", sizeMm: { w: 10, d: 10, h: 10 } },
                  offsetMm: { x: 0, y: 0, z: 0 },
                },
              ],
            },
          }
        : s,
    );
    const second = buildSceneSpec(geometry, mutated);
    const a = first.parts.filter((p) => p.modelId === target.model_id);
    const b = second.parts.filter((p) => p.modelId === target.model_id);
    expect(b).toHaveLength(a.length + 1);
    expect(b.some((p) => p.part === "extra_probe")).toBe(true);
  });

  it("colors finishable parts with the chosen finish, others ceramic white", () => {
    const { geometry, skus } = demoGeometry();
    const spec = buildSceneSpec(geometry, skus);
    for (const fixture of geometry.fixtures) {
      const sku = skus.find((s) => s.model_id === fixture.modelId)!;
      for (const prim of sku.geometry_descriptor.primitives) {
        const part = spec.parts.find((p) => p.modelId === fixture.modelId && p.part === prim.part)!;
        if (prim.finishable && fixture.finish) expect(part.colorHex).toBe(finishHex(fixture.finish));
        else expect(part.colorHex).toBe("#F6F7F8");
      }
    }
  });

  it("cuts wall segments at openings — the door span is a gap, not a wall", () => {
    const { geometry, skus } = demoGeometry();
    const spec = buildSceneSpec(geometry, skus);
    const door = geometry.openings[0];
    const doorStart = door.alongOffsetMm;
    const doorEnd = door.alongOffsetMm + door.spanMm;
    const wallParts = spec.parts.filter((p) => p.part.startsWith(`wall-${door.wallId}-`) && !p.part.includes(`-${door.id}`));
    expect(wallParts.length).toBeGreaterThanOrEqual(2);
    // Above the door head the wall is filled back in; the doorway itself stays open.
    const head = spec.parts.find((p) => p.part === `wall-${door.wallId}-head-${door.id}`);
    expect(head?.positionMm.y).toBe((DOOR_HEAD_MM + WALL_HEIGHT_MM) / 2);
    expect(spec.parts.some((p) => p.part === `wall-${door.wallId}-sill-${door.id}`)).toBe(false);
    expect(spec.openings.map((o) => o.id)).toEqual([door.id]);
    for (const p of wallParts) {
      const m = p.part.match(/-(\d+)-(\d+)$/);
      expect(m, p.part).not.toBeNull();
      const a = Number(m![1]);
      const b = Number(m![2]);
      expect(b <= doorStart || a >= doorEnd, `segment ${a}..${b} overlaps door ${doorStart}..${doorEnd}`).toBe(true);
      expect(p.positionMm.y).toBe(WALL_HEIGHT_MM / 2);
    }
  });

  it("rejects a fixture with no catalog descriptor", () => {
    const { geometry } = demoGeometry();
    expect(() => buildSceneSpec(geometry, [])).toThrow("missing catalog SKU");
  });

  it("uses catalog y above the engine mounting height and rotates side-wall geometry", () => {
    const { geometry, skus } = demoGeometry();
    const target = geometry.fixtures[0]!;
    const sku = skus.find((s) => s.model_id === target.modelId)!;
    const side = {
      ...target,
      aabb: { min: { x: 0, y: 500 }, max: { x: sku.dim.d, y: 500 + sku.dim.w } },
    };
    const spec = buildSceneSpec({ ...geometry, fixtures: [side] }, skus);
    const primitive = spec.parts.find((p) => p.modelId === target.modelId)!;
    const descriptor = sku.geometry_descriptor.primitives.find((p) => p.part === primitive.part)!;
    const height = descriptor.kind.shape === "box" ? descriptor.kind.sizeMm.h : descriptor.kind.hMm;
    expect(primitive.positionMm.y).toBe(mountElevationMm(sku) + height / 2 + descriptor.offsetMm.y);
    expect(primitive.rotationY).toBe(Math.PI / 2);
  });

  it("wallSolidRanges: no strips → no ranges", () => {
    expect(wallSolidRanges([], []).size).toBe(0);
  });
});
