// Bounded in-memory candidate-set cache (T-011, ADR-016): caches the validated,
// finish-resolved candidate set per cache key — candidates AND resolved finishes
// together (T-009 handoff, ADR-026 consequence), so a re-score never re-resolves.
// Weight-only changes hit by key construction; geometry/constraint/budget/config
// changes miss and recompute. Eviction is insertion-order (oldest first) — the demo
// works over a handful of briefs, so a small bounded map needs no LRU machinery.
import type { InputSet } from "../contracts/input.js";
import type { CatalogState } from "../catalog/schema.js";
import { validatedCandidates, type ValidatedCandidates } from "../objective/solve.js";
import { candidateCacheKey } from "./key.js";

const MAX_CACHE_ENTRIES = 32;

export class CandidateCache {
  private readonly entries = new Map<string, ValidatedCandidates>();

  get(key: string): ValidatedCandidates | undefined {
    return this.entries.get(key);
  }

  put(key: string, value: ValidatedCandidates): void {
    if (this.entries.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, value);
  }

  /** Drop the entry for this input's key (invalidation on local/global change). */
  invalidate(input: InputSet, catalog?: CatalogState): void {
    this.entries.delete(candidateCacheKey(input, catalog));
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

/** Module-level shared cache: the engine is an in-process deterministic module
 *  (ADR-001); one process-wide cache keeps re-scores instant across calls. */
export const candidateCache = new CandidateCache();

/** Cache-first access to the validated/finish-resolved candidate set. On a miss the
 *  set is computed once (solver + finish resolution, ADR-026) and stored. Never
 *  returns stale data: the key covers every candidate-affecting input dimension. */
export function cachedValidatedCandidates(
  input: InputSet,
  catalog: CatalogState,
): ValidatedCandidates {
  const key = candidateCacheKey(input, catalog);
  const hit = candidateCache.get(key);
  if (hit !== undefined) return hit;
  const fresh = validatedCandidates(input, catalog);
  if (fresh.kind === "ok") candidateCache.put(key, fresh);
  return fresh;
}
