// Relaxation + alternative-profiles module (T-010, ADR-020): fail-cause tracing,
// hand-ordered relaxation paths, the 1–3-plan menu / out-of-scope wall (mode 2),
// and the ordinary-brief alternative priority profiles (mode 1, ADR-005).
export { diagnoseFailures } from "./diagnose.js";
export type { FailCause, FailCategory, FailDiagnosis } from "./diagnose.js";
export { relaxationPaths } from "./paths.js";
export type { RelaxationPath } from "./paths.js";
export { buildRelaxationMenu, MAX_RELAXATION_PLANS } from "./relax.js";
export { alternativeProfiles } from "./alternatives.js";