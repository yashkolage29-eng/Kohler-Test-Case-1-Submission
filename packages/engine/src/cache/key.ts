// Canonical candidate-set cache key (T-011, ADR-016): the candidate set is a pure
// function of (geometry ∪ feature-constraints ∪ budget ∪ config) — OPT §8.4/§17-Q8
// prescribes caching per (archetype ∪ geometry ∪ constraint-state). Priority and
// spaciousness are deliberately EXCLUDED: they are weight-only knobs (ADR-005/006)
// that affect scoring, never candidate generation or validation, so a priority tap
// must hit the same cache entry and re-score (ADR-016 "instant re-score").
// Config is included conservatively (archetypes/clearances/anchors all feed the
// solver): extra misses are cheap, staleness is never acceptable (ADR-017).
import type { InputSet } from "../contracts/input.js";
import type { CatalogState } from "../catalog/schema.js";
import { canonicalJson } from "../contracts/canonical.js";
import { sha256Hex } from "../catalog/hash.js";

/** Deterministic cache key for the validated/finish-resolved candidate set.
 *  Openings are sorted by id (CANONICAL_ENTITY_ORDER) so reordering them — which
 *  cannot change the room — does not invalidate. priority/spaciousness excluded. */
export function candidateCacheKey(input: InputSet, catalog?: CatalogState): string {
  const canonical = {
    polygon: input.polygon,
    openings: [...input.openings].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    confirmed: input.confirmed,
    featureConstraints: input.featureConstraints,
    budget: input.budget,
    config: input.config,
    catalog: catalog === undefined ? undefined : catalogCanonicalForm(catalog),
  };
  return sha256Hex(canonicalJson(canonical));
}

/** CatalogState contains Maps, which canonicalJson intentionally does not inspect.
 * Serialize every candidate-affecting catalog field into sorted arrays so cache
 * entries cannot cross catalog snapshots. */
function catalogCanonicalForm(catalog: CatalogState): unknown {
  return {
    skus: [...catalog.skus].sort((a, b) => a.model_id.localeCompare(b.model_id)),
    compatibilityGraph: [...catalog.compatibilityGraph.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, values]) => [id, [...values].sort()]),
    substitutes: [...catalog.substitutes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, values]) => [id, [...values].sort()]),
    dataGaps: [...catalog.dataGaps].sort(),
  };
}
