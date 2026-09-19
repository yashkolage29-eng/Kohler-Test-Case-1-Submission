// T-019 cache QA: bounded eviction and catalog isolation.

import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, candidateCache, loadCatalog, solve } from "../index.js";
import type { CatalogState } from "../catalog/schema.js";
import type { InputSet } from "../contracts/input.js";
import { CandidateCache } from "../cache/cache.js";

const { state: catalog } = loadCatalog();

const input: InputSet = {
  polygon: {
    vertices: [{ x: 0, y: 0 }, { x: 2400, y: 0 }, { x: 2400, y: 1800 }, { x: 0, y: 1800 }],
    ccw: true,
    wallThicknessMm: 100,
  },
  openings: [{
    id: "door-1",
    wallId: "wall-bottom",
    kind: "door",
    alongOffsetMm: 1500,
    spanMm: 600,
    swing: { side: "in", leafDimsMm: { w: 600, d: 25 } },
  }],
  confirmed: true,
  featureConstraints: {
    requiredFeatures: [],
    preferredClasses: [],
    finishFamilies: ["white", "chrome"],
    classCountRanges: {},
  },
  priority: "balanced",
  spaciousness: "balanced",
  budget: { bMax: 250000, bTarget: 180000 },
  config: DEFAULT_CONFIG,
};

describe("T-019 cache invariants", () => {
  it("evicts the oldest entry at the documented 32-entry bound", () => {
    const cache = new CandidateCache();
    for (let i = 0; i < 33; i++) {
      cache.put(`key-${i}`, { kind: "gate-blocked", reasons: [] });
    }
    expect(cache.size).toBe(32);
    expect(cache.get("key-0")).toBeUndefined();
    expect(cache.get("key-1")).toBeDefined();
    expect(cache.get("key-32")).toBeDefined();
  });

  it("never reuses a validated candidate set for a different catalog", () => {
    candidateCache.clear();
    const emptyCatalog: CatalogState = {
      skus: [],
      compatibilityGraph: new Map(),
      substitutes: new Map(),
      dataGaps: ["synthetic empty catalog"],
    };
    try {
      expect(solve(input, catalog).kind).toBe("plan");
      expect(solve(input, emptyCatalog).kind).not.toBe("plan");
    } finally {
      candidateCache.clear();
    }
  });
});
