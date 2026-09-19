# T-021 — Demo Hardening & Acceptance Rehearsal (evidence)

Date: 2026-09-16 · Rehearsal harness: `scripts/rehearse.mjs` (run `npm run build && node scripts/rehearse.mjs`).
All engine behavior below was measured against the built engine; no engine code was changed in this task.

## 1. Clean-machine baseline

| Check | Result |
|---|---|
| `npm install` (workspace monorepo) | deterministic entry points (root `package.json`) |
| `npm run build` (engine + server + web) | pass, no errors |
| `npm run typecheck` | pass, all 3 workspaces |
| `npm test` | 320/320 tests pass (engine 252, server 38, web 30) |
| Server boot, offline (`node packages/server/dist/index.js`) | HTTP 200 at `http://127.0.0.1:4173/`, no network/key needed |
| Core loop offline guarantee | engine solves in-browser; AI surface optional (N1 honored) |

## 2. Scripted brief rehearsal (evidence, per run)

### Scenario A — typical brief (2400×1800, white/chrome taste, ₹2.5L max)
- Output: **valid plan**, 3 fixtures (toilet K-3999-0, basin K-1999-0, faucet K-45800-4-CP), BOM 3 lines, total **₹40,200 ≤ bMax**.
- Latency: ~200 ms first solve (cold catalog), ~10 ms repeat.
- **Determinism**: two runs produce identical plan id, cost, and BOM (`deterministic: true`).

### Scenario A2 — steer (priority → luxury re-roll)
- `reoptimize` re-validated output: **plan**, 13 ms. Every re-roll passes the validator (PRD §7.4).

### Scenario B1 — recoverable impossible brief (add-a-tub demand, ₹90k max)
- Output: **relaxation menu**, 1 validated way (`drop-class`), plan cost ₹40,200, fully validated, within relaxed budget. No fake plan.

### Scenario B2 — taste-blocked brief (stone/matte_black finish taste)
- Output: **relaxation menu**, 1 validated way (`swap-sku`). No fake plan.

### Scenario B3 — kill-question brief (PRD §17 verbatim: ~5'×6', tub + shower + double vanity + toilet)
- Output: **honest out-of-scope wall** in 7 ms. No fake plan, no crash, no silent best-effort (PRD §7.5). `minViableCost: 40200` reported.

### All paths latency
Every scripted output (plan / menu / out-of-scope) computed in **≤ 450 ms** on the rehearsal machine — comfortably inside the 2 s solver bound.

## 3. Demo rails (live-judge script)

1. **Typical brief** → "A plan you can price": show receipt + BOM + 2D/3D (₹40,200, validated).
2. **Steer**: change priority → re-validated plan, receipt refreshes (delta narrated from measured scores).
3. **Impossible brief (menu)**: add-a-tub with a ₹90k ceiling → "Brief needs a trade-off — 1 validated option found" → pick it → buildable plan. Narrate honestly: **one measured way** (drop the tub), not "3 ways".
4. **Kill brief**: demand the impossible → the honest wall state. Strongest trust moment: "no fake plan."
5. **Export**: BOM CSV + 2D PNG from the final plan (adjustment flow re-optimizes before export; UI enforces).

## 4. Known demo limitations (honest, recorded — do not hide from judges)

- **Menu richness**: no discovered demo-reachable brief yields ≥2 distinct recovery plans; all observed failures are single-lever (TODO-27). Demo says "1 validated way."
- **`raise-budget` lever is effectively dead**: `minViableCost` counts only config class-minimums (₹40,200, toilet+basin+faucet) and the ₹50k MIN_BUDGET gate already exceeds it, so the budget deficit is never positive for UI-reachable briefs.
- **Double-vanity asks are structurally infeasible**: every archetype caps `vanity` at max 1, so the demand conflicts with all templates → always `no-feasible-archetype` (this is what makes the PRD §17 verbatim brief hit the wall).
- **Vanities ship only in `white_stone`** (family `stone`): a white/chrome finish taste empties the vanity pool → zero-candidate failures with no blockers. The `swap-sku` relaxation recovers it, but the primary failure diagnosis is thin (`no-valid-candidate` with empty blockers).
- Very small rooms (≤1500×1200) can fail via **backtracking-budget exhaustion** rather than a crisp geometric diagnosis; behavior remains honest (out-of-scope, no fake plan).

Items in §4 are engine/product-scope changes, not demo-blockers; they are recorded in `tasks/TODO.md` for post-submission work.

## 5. MVP acceptance review (PRD §16)

| # | Criterion | Status |
|---|---|---|
| 1 | Valid, costed, code-flavored plan for a typical brief | ✅ ₹40,200 plan, receipt + rules surfaced |
| 2 | Every plan / re-roll / relaxation passes the validator | ✅ 320/320 tests + rehearsal; no invalid output path |
| 3 | Budget & clearance outputs correct, reproducible, explainable | ✅ determinism check true; decision receipt shown |
| 4 | 3D matches its BOM | ✅ sceneSpec render-equality tests (T-019/T-020) |
| 5 | Runs on judge-grade machine with or without network/keys | ✅ offline boot + solve rehearsal above |
| 6 | 4 deliverables within budget | ⏳ T-022 (prompts doc, demo checklist, deck/video inputs) |
| 7 | "Planner, not chatbot"; alive impossible-brief flow | ✅ solver-gated flow; relaxation menu + honest wall demoed |
