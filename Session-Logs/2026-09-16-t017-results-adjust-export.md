# Session log — T-017 results, adjustment, and export flow (2026-09-16)

## Scope delivered

- Added a third Result screen after a completed deterministic solve. It handles validated
  plans, impossible-brief relaxation menus, and the honest out-of-scope result without
  fabricating a plan.
- Added receipt-bound narration with `/api/nim` integration and a deterministic local
  receipt-only fallback. Relaxation trade-off copy uses engine-generated facts.
- Added the authoritative 2D/3D toggle. Both views consume `buildRenderGeometry`; 2D uses
  `drawRender2d`, and 3D uses the existing procedural `mountRender3d` catalog path.
- Added BOM presentation and CSV export plus PNG export of the authoritative 2D canvas.
- Added typed adjustments for priority, spaciousness, budget, fixture-class requirements,
  and door position. Changed inputs are marked pending until `reoptimize()` completes;
  stale plans are not re-rendered or exported.
- Deduplicated receipt top-k rows by candidate id for safe UI keys/presentation, as noted in
  `tasks/TODO.md`.
- Follow-up review fixes invalidate stale outputs after brief edits, cancel stale async
  narration/trade-off responses, validate L-shaped door offsets against wall strips, preserve
  relaxation selection by kind where possible, classify mixed adjustments as global, and gate
  both exports while edits are pending.

## Verification

- `npm run typecheck` — passed for engine, server, and web.
- `npm run build` — passed; Vite emitted only the existing Three.js bundle-size warning.
- `npm test` — engine 195/195, server 38/38, web 26/26 passed.
- Impeccable detector over changed web files — no findings.
- In-app browser discovery returned no targets after the prescribed troubleshooting check;
  desktop/mobile live smoke and screenshots remain unavailable. T-017 remains `REVIEW`.

## Files changed

- `packages/web/src/main.ts`
- `packages/web/src/store.ts`
- `packages/web/src/store.test.ts`
- `packages/web/src/styles.css`
- `tasks/TASKS.md`
- this session log
