# Submission Checklist — KOHLER AI Bathroom Designer & Planner

T-022 evidence review (2026-09-16). Checklist reviewed against PRD §16 (success criterion 6: "completes the 4 deliverables within budget") and `submission/AI_DEVELOPMENT_LOG.md`. No product-scope change was made in this task.

## 1. The four PRD deliverables

| # | Deliverable | Status | Artifact / source |
|---|---|---|---|
| 1 | **Source code** | ✅ complete | Monorepo at repo root (`packages/engine` / `web` / `server`). **Open risk:** no git repository is initialized at the workspace root (parked TODO item from T-001), so VCS history cannot be submitted. Session logs + this log + `docs/DECISIONS.md` provide the auditable record. |
| 2 | **AI Prompts Documentation PDF** | ✅ source complete → PDF export is a hand-off step | `submission/AI_DEVELOPMENT_LOG.md` — one entry per task (T-000…T-022) with agent, prompt/purpose, reasoning, decisions, verification, failures; plus the verbatim product-prompt appendix. All entries fact-checked against `session-logs/`. |
| 3 | **Demo video (1–3 min)** | ✅ shot script ready → recording is a hand-off step | §3 below. All numbers cited are re-measured live on 2026-09-16 (see §4). |
| 4 | **Deck (≤4 slides)** | ✅ outline ready → slide build is a hand-off step | §2 below. |

## 2. Deck outline (≤4 slides)

1. **Thesis** — "AI proposes and reasons; deterministic systems guarantee buildability." Every plan is validated (C1–C8 + budget) before the user sees it; the AI can never emit an unvalidated plan. Screenshot: receipt + validation panel.
2. **How it works** — Room (dims/photo, user-confirmed) → Taste (closed-vocabulary mapping, offline fallback) → deterministic solver (archetypes, bounded backtracking, anchored objectives) → receipt-bound narration. AI surface: NVIDIA NIM Kimi K3, strictly guarded.
3. **Proof** — 320/320 tests; typical brief ₹40,200 validated plan, deterministic, ~200 ms; every re-roll/relaxation re-validated; 3D = BOM (cross-renderer equality suite); runs offline, no keys, judge-grade laptop.
4. **The kill question** — impossible brief → honest wall or a validated relaxation menu ("1 honest way"), never a fake plan. "Planner, not chatbot." Known limitations disclosed (DEMO_REHEARSAL §4).

## 3. Demo-video shot script (~2 min, follows T-021 demo rails)

| Shot | Time | Action | Narration cue |
|---|---|---|---|
| 1 | 0:00–0:15 | Room screen: enter 2400×1800, preview, confirm | "Dimensions decide — the photo only seeds." |
| 2 | 0:15–0:35 | Taste: "calm white spa on a budget", priority balanced, ₹2.5L max | Closed-vocabulary mapping; offline fallback visible if no server. |
| 3 | 0:35–1:00 | Result: plan ₹40,200; receipt + rules panel; 2D → 3D toggle | "Every claim is auditable; 3D fixtures are exactly the BOM." |
| 4 | 1:00–1:20 | Steer: priority → luxury; re-optimized plan in ~10 ms | "Re-validation, not re-invention." |
| 5 | 1:20–1:45 | Impossible brief: add-a-tub at ₹90k → relaxation menu (1 validated way) → pick → buildable plan | Honest: "one measured way," not "3 ways." |
| 6 | 1:45–2:00 | Kill brief (~5'×6', tub+shower+double vanity+toilet) → honest out-of-scope wall; export BOM CSV + PNG | "No fake plan. That is the trust moment." |

## 4. Live verification evidence (re-run for this checklist, 2026-09-16)

- `npm run build` — clean (engine, server, web; Three.js bundle-size warning only).
- `npm test` — **320/320 pass** (engine 252, server 38, web 30).
- `node scripts/rehearse.mjs` — typical: `kind: plan`, cost **₹40,200**, 3 fixtures, 3 BOM lines, `deterministic: true`, **193 ms** first / **9 ms** repeat, within budget; steer reopt valid in 8 ms; add-a-tub → relaxation menu (`drop-class`); matte-black taste → relaxation menu (`swap-sku`).
- Per T-021 evidence: kill brief → honest out-of-scope in 7 ms; offline server boot HTTP 200 at 127.0.0.1:4173; `GET /api/nim` → 405.

## 5. Honest limitations (disclosed, not hidden)

1. **T-015 (3D renderer) remains `REVIEW`**: automated acceptance is complete (scene-graph equality, determinism, T-020 cross-renderer equality, T-021 rehearsal), but the desktop/mobile **visual-inspection gate never ran** — the in-app browser connector returned no targets in every attempt. No visual pass is claimed anywhere in the submission. *Close by: a 2-minute manual visual check of the 3D tab on a laptop + phone browser.*
2. **No git repository** at the workspace root (TODO from T-001). Initialize and commit before submission if VCS history is part of the source deliverable.
3. **Menu richness**: demo-reachable impossible briefs yield exactly **1** validated relaxation way (causes analyzed in TODO-27 / DEMO_REHEARSAL §4). Narrate as "one honest way."
4. **Dev-only npm-audit advisories** (2 moderate, vitest chain): runtime ships zero dependencies; unaffected offline demo (TODO item).
5. Catalog values are planning-level estimates where trade data could not be network-verified (pre-demo trade-data pass parked in TODO).

## 6. Evidence index

| Artifact | Path |
|---|---|
| Per-task AI development log + product prompt appendix | `submission/AI_DEVELOPMENT_LOG.md` |
| Demo rehearsal evidence + demo rails + MVP acceptance | `submission/DEMO_REHEARSAL.md` |
| Rehearsal harness | `scripts/rehearse.mjs` |
| Architecture decisions (ADR-001…) | `docs/DECISIONS.md` |
| Product / architecture / optimization / catalog specs | `docs/PRD.md`, `docs/SYSTEM_ARCHITECTURE.md`, `docs/OPTIMIZATION_SPEC.md`, `docs/PRODUCT_CATALOG_SCHEMA.md` |
| Per-session implementation records | `session-logs/` (T-001…T-020) |
| Execution state | `tasks/TASKS.md`, `tasks/TODO.md` |
