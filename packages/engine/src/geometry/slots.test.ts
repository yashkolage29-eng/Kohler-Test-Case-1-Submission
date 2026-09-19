import { describe, expect, it } from "vitest";

import { snapToSlotMm } from "./slots.js";

describe("snapToSlotMm", () => {
  it("rounds to the nearest slot", () => {
    expect(snapToSlotMm(12, 25)).toBe(0);
    expect(snapToSlotMm(13, 25)).toBe(25);
    expect(snapToSlotMm(40, 25)).toBe(50);
    expect(snapToSlotMm(0, 25)).toBe(0);
  });

  it("resolves half-way cases toward +Infinity (consistent with roundMm)", () => {
    expect(snapToSlotMm(12.5, 25)).toBe(25);
    expect(snapToSlotMm(-13, 25)).toBe(-25);
  });

  it("canonicalizes -0 to 0", () => {
    expect(Object.is(snapToSlotMm(-0.1, 25), 0)).toBe(true);
  });

  it("supports non-integer grids and returns canonical 1-dp output", () => {
    expect(snapToSlotMm(5.2, 2.5)).toBe(5);
    expect(snapToSlotMm(3.76, 2.5)).toBe(5);
  });

  it("throws on non-finite position or invalid grid (determinism over silence)", () => {
    expect(() => snapToSlotMm(Number.NaN, 25)).toThrow();
    expect(() => snapToSlotMm(Number.POSITIVE_INFINITY, 25)).toThrow();
    expect(() => snapToSlotMm(10, 0)).toThrow();
    expect(() => snapToSlotMm(10, -25)).toThrow();
    expect(() => snapToSlotMm(10, Number.NaN)).toThrow();
  });
});
