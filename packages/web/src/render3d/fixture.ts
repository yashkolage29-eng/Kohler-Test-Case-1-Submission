// T-015 shared demo fixture for render3d tests: real catalog + real solve, same brief
// as main.ts (T-014 pattern). Deterministic.
import {
  buildRenderGeometry,
  loadCatalog,
  solve,
  DEFAULT_CONFIG,
  type InputSet,
  type RenderGeometry,
  type SKU,
  type Vec2,
} from "@kolher/engine";

const v = (x: number, y: number): Vec2 => ({ x, y });

export function demoGeometry(): { geometry: RenderGeometry; skus: SKU[] } {
  const { state } = loadCatalog();
  const input: InputSet = {
    polygon: { vertices: [v(0, 0), v(2400, 0), v(2400, 1800), v(0, 1800)], ccw: true, wallThicknessMm: 100 },
    openings: [
      {
        id: "door-1",
        wallId: "wall-bottom",
        kind: "door",
        alongOffsetMm: 1500,
        spanMm: 600,
        swing: { side: "in", leafDimsMm: { w: 600, d: 25 } },
      },
    ],
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
  const output = solve(input, state);
  if (output.kind !== "plan") throw new Error(`demo brief did not solve: ${output.kind}`);
  return { geometry: buildRenderGeometry(output.plan, input), skus: state.skus };
}
