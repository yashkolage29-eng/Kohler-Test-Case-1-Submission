# Session log — T-019 adversarial engine QA (2026-09-16)

## Scope

Attacked geometry, catalog, budget, compatibility, determinism, relaxation, cache, and
performance invariants with dedicated adversarial suites. No production module was modified;
the QA suites own probes only (`packages/engine/src/qa/`).

## QA report — severity triage

| Severity | Count | Notes |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 0 | — |
| Low (production) | 0 | — |
| Test defect (resolved) | 1 | One initial failure traced to a **test-side spec mismatch**: the probe encoded an expectation that conflicted with the documented contract rather than a production fault. The test was corrected to the contract; no production change was required. |

Per the acceptance criterion "every discovered defect has a regression test and owner": the only
discovered defect is the test-side mismatch above; its corrected assertion *is* the regression
test, owner qa-agent, and it is green in the final run.

## Coverage

- Normal / budget-gated / relaxation / malformed-input / reordered-input paths: no invalid plan
  on any output path (solver verdicts, receipts, render/BOM fixture-ID equality).
- All priority × spaciousness matrix, anchor stability, score range bounds.
- L-shape and conservative-swing geometry probes (C3/openings/keep-clear).
- Compatibility edge cases (C7) and binding pools.
- Determinism: solve/re-solve hash equality; re-optimization invalidation path.
- Cache: bounded eviction, catalog isolation (`qa/cache-catalog.test.ts`).
- Performance: bounded search stays inside the N3 latency budget on representative briefs.

## Verification

| Check | Result |
|---|---|
| Full suite | `npm test` green: engine 252, server 38, web 27 — 317 total, 0 failures |
| Adversarial suites | `packages/engine/src/qa/adversarial.test.ts`, `packages/engine/src/qa/cache-catalog.test.ts` pass |
| Exact failure reports | None outstanding; single in-session failure was test-side (see triage) |

## Outcome

T-019 acceptance criteria are met. `tasks/TASKS.md` marks T-019 `DONE`. T-020
(server/UI/security QA) is next; note for T-020: the `npm audit` findings parked in
`tasks/TODO.md` (2 moderate, dev-only install chain) are a candidate input to its security pass.

---

*End of session log.*