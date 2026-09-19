import { describe, expect, it } from "vitest";
import { loadCatalog } from "../catalog/index.js";
import { COUNTER_HEIGHT_MM, mountElevationMm } from "./mounting.js";

describe("mountElevationMm", () => {
  const { state } = loadCatalog();
  const sku = (id: string) => state.skus.find((s) => s.model_id === id)!;

  it("puts basin rims at counter height and vessel bowls on the counter", () => {
    for (const s of state.skus.filter((x) => x.fixture_class === "basin")) {
      const vessel = s.name.toLowerCase().includes("vessel");
      expect(vessel ? mountElevationMm(s) : mountElevationMm(s) + s.dim.h, s.model_id).toBeCloseTo(COUNTER_HEIGHT_MM, 5);
    }
    expect(mountElevationMm(sku("K-25316IN-0"))).toBe(COUNTER_HEIGHT_MM);
  });

  it("stands deck faucets on the counter and keeps floor products on the floor", () => {
    expect(mountElevationMm(sku("K-10270-4-CP"))).toBe(COUNTER_HEIGHT_MM);
    for (const s of state.skus.filter((x) => ["vanity", "tub"].includes(x.fixture_class))) expect(mountElevationMm(s)).toBe(0);
    expect(mountElevationMm(sku("K-3654-0"))).toBe(0);
  });

  it("hangs wall products at standard heights", () => {
    expect(mountElevationMm(sku("K-73040IN-CL-CP")) + 61.9).toBeCloseTo(2100, 5);
    expect(mountElevationMm(sku("K-76465-CP"))).toBe(950);
    expect(mountElevationMm(sku("K-2973-KS-NA"))).toBe(1000);
    expect(mountElevationMm(sku("K-14434-CP"))).toBe(620);
    expect(mountElevationMm(sku("K-99007-NA"))).toBe(1150);
    expect(mountElevationMm(sku("K-28780IN-0"))).toBeCloseTo(50.7, 5);
  });

  it("keeps every product below the 2400 mm ceiling", () => {
    for (const s of state.skus) expect(mountElevationMm(s) + s.dim.h, s.model_id).toBeLessThanOrEqual(2400);
  });
});
