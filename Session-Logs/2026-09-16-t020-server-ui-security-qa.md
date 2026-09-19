# Session log — T-020 server/UI/security QA (2026-09-16)

## Scope

Attacked the server boundary (packages/server), AI failure/degradation posture, web UI state
completeness, render equality across the 2D/3D renderers, export, secrets, path traversal,
input limits, and cross-viewport basics. No production code was modified; the only change is
one new QA test file.

## QA report — severity triage

| Severity | Count | Notes |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 0 | — |
| Low | 2 | See L1/L2 below — parked in `tasks/TODO.md`, non-blocking |

- **L1 (informational):** `GET /api/nim` falls through to the SPA fallback (200 text/html)
  instead of a 405, because the API block only intercepts POST and the method guard sits
  after it. Not exploitable (GET performs no work) and unused by the UI. Parked for T-021 or a
  one-line method guard.
- **L2 (dev-only supply chain):** `npm audit` reports 2 moderate findings in the
  vitest/@vitest/mocker dev chain (GHSA-82fw-gwwq-j7x9, path traversal in the test-time mock
  redirect). Fix requires vitest@5 (breaking). Runtime ships zero dependencies; offline demo
  unaffected. Matches the item parked in `tasks/TODO.md` from T-001.

## Coverage and evidence

| Area | Method | Result |
|---|---|---|
| Server boundary | Existing T-012 suite (static host, SPA fallback, MIME allowlist, method guard, 413/415/400 bounded-body, oversized-body connection destroy) — 38 tests | Pass |
| Path traversal | Encoded `..`, null-byte, dot-segment smuggling, non-allowlisted extension probes | No file outside webRoot served; misses are index.html-only |
| AI failure/degradation | T-013 adapter suite: non-2xx, timeout, invalid JSON/schema, injection tripwires → offline twin; all four tasks answer offline; NIM-configured fallback key-echo check | `fallback:true` posture on every failure; never throws |
| Offline vs hosted consistency | Closed-vocabulary validators shared by both paths; NIM happy-path tests (valid JSON passes, unknown tags dropped, invented numbers rejected) | Same contract both postures |
| Secrets | Grep for key patterns across src/dist; runtime reads `process.env` only; response-body key-echo tests | No key material in source or web bundle; key never echoed |
| Engine solve on server | Grep of server http/static/index for solve/reoptimize | None — solve stays in-browser (ADR-011) |
| UI state completeness | Store suite (room gate, confirmation, taste idle/success, solve success/error, adjustment dirty-tracking) + full-loop test | Pass |
| Render equality | Store suite (render ↔ BOM fixture-ID equality, receipt rule-trace pass) + **new T-020 cross-renderer suite**: one authoritative RenderGeometry feeds both 2D draw and 3D scene spec; fixture sets equal to BOM; both deterministic on a real solve | Pass (3 new tests) |
| Export | Gate behavior (blocked while adjustmentsDirty), BOM CSV cell escaping, PNG layout export from authoritative geometry (T-017) | Consistent with receipt/BOM |
| Input limits | 1 MB body hard-destroy; taste text sliced to 4000 chars; strict JSON shape validation | Pass |
| HTTP + UI smoke | Built bundle, started server on 127.0.0.1:4599: `/`, `/assets`, `/some/route` → 200 text/html (SPA); `POST /api/nim` taste → deterministic offline closed-vocab mapping | Pass |
| Cross-viewport | No viewport-specific logic exists; canvas render is resolution-independent via `computeView` (uniform scale + padding, projection tests) | No defect; live visual check remains T-015's REVIEW gate |
| Performance | Fresh engine build, representative briefs: solve ≈ 192 ms cold, cached re-solve ≈ 116 ms, cached re-optimization ≈ 11 ms (all inside the N3 2 s budget) | Pass |
| Types / full suite | `npm run typecheck` all workspaces; `npm test` after new tests: engine 252, server 38, web 30 = 320 | Pass |

## Changes

- `packages/web/src/qa/qa.test.ts` (new): T-020 cross-renderer equality suite — 2D/3D fixture
  set = BOM set on a real solve; 2D draw determinism; 3D scene-spec determinism.

## Outcome

No critical/high findings remain; offline and hosted-AI paths behave consistently for
correctness. `tasks/TASKS.md` marks T-020 `DONE`. L1/L2 parked in `tasks/TODO.md`. T-021
(demo hardening and acceptance rehearsal) is next.

---

*End of session log.*