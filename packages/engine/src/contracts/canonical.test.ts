import { describe, expect, it } from "vitest";

import { canonicalJson, MM_PRECISION_DP } from "./canonical.js";
import { DEFAULT_CONFIG } from "../config/config.js";
import { PRIORITIES } from "./vocab.js";

describe("canonicalJson", () => {
  it("is independent of object key insertion order", () => {
    const a = canonicalJson({ b: 1, a: { y: 2, x: 3 }, c: [1, 2] });
    const b = canonicalJson({ c: [1, 2], a: { x: 3, y: 2 }, b: 1 });
    expect(a).toBe(b);
  });

  it("formats numbers at the canonical millimetre precision", () => {
    expect(MM_PRECISION_DP).toBe(1);
    // 1.04 rounds down, 1.06 rounds up at 1 dp (half-way float values avoided).
    expect(canonicalJson({ d: 1.04 })).toBe('{"d":1.0}');
    expect(canonicalJson({ d: 1.06 })).toBe('{"d":1.1}');
  });

  it("throws on non-finite numbers instead of emitting non-deterministic output", () => {
    expect(() => canonicalJson({ d: Number.NaN })).toThrow();
  });
});

describe("DEFAULT_CONFIG invariants", () => {
  it("every priority weight table sums to exactly 1.0", () => {
    for (const p of PRIORITIES) {
      const w = DEFAULT_CONFIG.weights[p];
      const sum = w.uCost + w.uSpace + w.uWater + w.uLuxury + w.uMaintenance;
      expect(sum).toBeCloseTo(1.0, 10);
    }
  });

  it("receipt top-k meets the OPT §12 minimum (k ≥ 3)", () => {
    expect(DEFAULT_CONFIG.topK).toBeGreaterThanOrEqual(3);
  });
});
