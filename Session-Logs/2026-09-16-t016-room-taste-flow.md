# Session log — T-016 room and taste flow (2026-09-16)

Owner: orchestrator; frontend implementation and verification pass.

## Scope delivered

- Added a reducer-backed browser session store in `packages/web/src/store.ts`.
- Added the Room screen: rectangle/L-shape dimensions, optional photo upload bounded to
  700 KB, deterministic authoritative preview, default door opening, malformed-input
  errors, and explicit preview confirmation.
- Added the Taste screen: taste text, optional AI-adapter request, deterministic offline
  closed-vocabulary fallback, editable feature/finish chips, priority, spaciousness,
  target/max budget, loading/empty/error/success states, and the confirmed-room summary.
- Wired the solver through `buildConfirmedInput()`/`solveConfirmed()`. Unconfirmed room
  state returns a typed gate error and never reaches `solve()`.
- Added a responsive restrained planner UI in `packages/web/src/styles.css`, preserving
  the project's offline-first and planning-level honesty framing.

## Deterministic and AI boundaries

- `/api/nim` is attempted only as an advisory mapping seam.
- Missing server, timeout, malformed response, or offline use falls back to a local
  closed-vocabulary mapper.
- Photo handling reports advisory-only cues; it never creates authoritative geometry.
- The engine receives only the confirmed polygon/openings and typed budget/preferences.

## Verification

- `npm run typecheck` — passed for engine, server, and web.
- `npm run build --workspace @kolher/web` — passed; Vite emitted the Room/Taste bundle.
- `npm test --workspace @kolher/web` — 25/25 passed, including 7 T-016 store tests.
- `npm test --workspace @kolher/engine` — 195/195 passed.
- `node /Users/yashkolage/.agents/skills/impeccable/scripts/detect.mjs --json packages/web/src/main.ts packages/web/src/store.ts packages/web/src/styles.css` — no findings.

## Follow-up live smoke attempt (2026-09-16)

Started the Vite app with `npm run dev --workspace @kolher/web -- --host 127.0.0.1`.
The server reached `http://127.0.0.1:5173/`; escalated local HTTP checks returned 200 for
the root HTML, `src/main.ts`, and `src/styles.css`. The in-app browser connector still
returned an empty browser list and `Browser is not available: iab`, even while the server
was live. Therefore a live click-through and desktop/mobile screenshots remain unavailable.

The task remains `REVIEW`, not `DONE`, until a browser target can verify the rendered Room
→ preview → confirm → Taste journey.

## Brave-target follow-up (2026-09-16)

The requested Brave target was checked through the browser runtime. The exposed browser
list was empty, and `brave`, `Brave`, `brave-browser`, `Brave Browser`, `brave_browser`,
and `desktop-brave` each returned `Browser is not available`. The local Vite process had
also exited before the follow-up HTTP probe, so no Brave click-through or screenshot could
be produced. T-016 therefore stays `REVIEW`; the implementation and automated checks remain
complete, but the live-browser acceptance item is still unverified.

## Files changed

- `packages/web/src/main.ts`
- `packages/web/src/store.ts`
- `packages/web/src/store.test.ts`
- `packages/web/src/styles.css`
- `tasks/TASKS.md`
- this session log

## Handoff

T-017 can consume the existing `output` in the store for the results view, then connect
the existing 2D/3D renderers and receipt/export surfaces without changing the room gate.

---
