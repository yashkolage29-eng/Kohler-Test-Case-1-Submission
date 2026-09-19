import { describe, expect, it } from "vitest";

import { EPSILON_MM } from "../contracts/canonical.js";
import { approxEqMm, roundMm } from "./num.js";

describe("roundMm", () => {
  it("rounds to the canonical 1-dp precision", () => {
    expect(roundMm(0)).toBe(0);
    expect(roundMm(1500)).toBe(1500);
    expect(roundMm(1.04)).toBe(1.0);
    expect(roundMm(1.06)).toBe(1.1);
    expect(roundMm(1800.06)).toBe(1800.1);
    expect(roundMm(-2.74)).toBe(-2.7);
  });

  it("rounds x.x5 boundaries per Math.round semantics (half toward +Infinity)", () => {
    // Values verified against the runtime (some decimal literals are stored
    // slightly above/below the exact half, but these land exactly on it).
    expect(roundMm(0.05)).toBe(0.1);
    expect(roundMm(1.05)).toBe(1.1);
    expect(roundMm(2.45)).toBe(2.5);
    expect(roundMm(1500.25)).toBe(1500.3);
    // Math.round(-x.5) goes toward +Infinity: -0.5 -> -0, canonicalized to 0.
    expect(roundMm(-0.05)).toBe(0);
  });

  it("canonicalizes -0 to 0", () => {
    const r = roundMm(-0.04); // Math.round(-0.4) is -0
    expect(r).toBe(0); // toBe uses Object.is: fails if r is -0
    expect(Object.is(r, -0)).toBe(false);
  });

  it("throws on non-finite input", () => {
    expect(() => roundMm(Number.NaN)).toThrow();
    expect(() => roundMm(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => roundMm(Number.NEGATIVE_INFINITY)).toThrow();
  });
});

describe("approxEqMm", () => {
  it("is inclusive at exactly EPSILON_MM", () => {
    // 0 and EPSILON_MM are the same double the implementation compares against.
    expect(approxEqMm(0, EPSILON_MM)).toBe(true);
    expect(approxEqMm(EPSILON_MM, 0)).toBe(true);
  });

  it("accepts differences inside the epsilon", () => {
    // 1/32 mm — exact in binary, avoids decimal float noise.
    expect(approxEqMm(1000, 1000.03125)).toBe(true);
    expect(approxEqMm(-5, -5.03125)).toBe(true);
    expect(approxEqMm(7.5, 7.5)).toBe(true);
  });

  it("rejects differences outside the epsilon", () => {
    // 1/16 mm — exact in binary, strictly greater than 0.05.
    expect(approxEqMm(1000, 1000.0625)).toBe(false);
    expect(approxEqMm(1000.0625, 1000)).toBe(false);
  });
});
