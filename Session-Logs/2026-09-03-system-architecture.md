# Session Log — KOHLER AI Bathroom Designer & Planner

**Session type:** System architecture design (Grill-me-informed) via lead AI orchestrator
**Date:** 2026-09-03
**Workspace:** `/Users/yashkolage/Downloads/kolher`
**Outcome:** Created the authoritative `docs/SYSTEM_ARCHITECTURE.md` after analysis,
challenge, and user confirmation.

---

## 1. Objective of this session

Produce `docs/SYSTEM_ARCHITECTURE.md` — the authoritative implementation architecture
for the prototype. Before writing anything:

- Understand the accepted decisions already recorded in `docs/DECISIONS.md` (ADRs 001–018),
  `docs/PRD.md`, and `docs/OPTIMIZATION_SPEC.md`.
- Identify which architectural choices were genuinely open versus already locked.
- Use Grill-me to challenge only the truly ambiguous decisions (one question at a time),
  rather than re-asking what the repository already answers.
- Deliver the full document **only after the user confirmed** the summarized architecture.

---

## 2. Prior context discovered

Before designing, the orchestrator inspected the workspace and read the source-of-truth docs.

- Repo has `.clinerules/AGENTS.md` + `.clinerules/rules.md` (not a root `CLAUDE.md`;
  the README-referenced root files live under `.clinerules/`).
- `docs/PRD.md` (407 lines) and `docs/OPTIMIZATION_SPEC.md` (441 lines) were already
  populated and authoritative.
- `docs/DECISIONS.md` (910 lines) already contained **all 18 accepted ADRs**, so the
  architecture was largely settled — the task was to *express it* as executable design,
  not to invent new decisions.
- `docs/SYSTEM_ARCHITECTURE.md` and `docs/PRODUCT_CATALOG_SCHEMA.md` were still **empty
  stubs** (the latter remains for a later session).
- `tasks/TASKS.md` does not yet exist.

### Architecture already locked by the ADRs (not re-decided)

| ADR | Locked decision |
|---|---|
| ADR-001 | Monorepo; deterministic engine as a pure-TS, in-browser authority; thin Node server; no backend hot path |
| ADR-002 | AI proposes/reasons/explains; deterministic core is sole authority for buildability |
| ADR-003 | Spatial model: room polygon → wall strips, fixtures, zones, slot grid |
| ADR-004/005/006 | Constructive layered CSP solver; single anchored weighted scalar objective; priority + bounded spaciousness modifier; 3-ways = alternative deterministic weight profiles |
| ADR-007 | Hybrid rule engine: declarative metadata + imperative evaluators → fired-rule trace (C1–C8) |
| ADR-008/012 | File-based schema-validated catalog with quarantine + compat graph; no database |
| ADR-009 | Photo = qualitative seed/taste/narration only; geometry always user-confirmed |
| ADR-010 | 2D = Canvas projection of engine AABB + trace; 3D = procedural three.js from catalog geometry |
| ADR-011 | TypeScript everywhere; Vite; pure-TS engine; three.js + Canvas; Node built-in HTTP; Vitest |
| ADR-013 | NIM Kimi-K3 behind a thin adapter; always-on deterministic offline fallback |
| ADR-014 | Two-layer explainability: decision receipt + narration bound to receipt schema |
| ADR-015 | Trace-driven relaxation → hand-ordered menu → 1–3 valid plans → honest out-of-scope |
| ADR-016 | Coarse component caching + instant re-score + bounded backtracking + render caching (~2 s) |
| ADR-017 | Gate-enforced Vitest regime (determinism hash, injected-invalid rejection, oracle, relaxation) |
---

## 3. Grill-me — the genuinely open decisions

Only two decisions were open in the source docs, and both materially change the
architecture document. Each was asked one at a time.

### Q1 — Frontend UI layer framework
**Question:** ADR-011 fixes the engine as "framework-free pure TypeScript" and web as
Vite + TS, but does not pin the UI component layer. Options: framework-free vanilla TS,
a small reactive layer (Svelte/lit), or React/Vite SPA.
**User answer:** **Framework-free vanilla TypeScript** (DOM + Three.js + Canvas). Most
consistent with ADR-011's framework-free intent; fewest moving parts.
**Consequence:** §9 Frontend architecture uses a small central store + pure view-render
functions, with no framework reactivity lifecycle.

### Q2 — Repo / package granularity
**Question:** ADR-001 says "engine package + web package + minimal Node server" but not
the workspace tooling. Options: full npm-workspaces monorepo (engine/web/server),
two-package (server in web), or single package with directories.
**User answer:** **npm-workspaces monorepo** — separate packages `engine`, `web`,
`server`. Cleanest boundary; honors the offline `npm install && run` guarantee (PRD N2).
**Consequence:** §1/§2 reflect a three-package workspace layout; engine stays DOM-free for
portability and testability.

No further questions were asked: everything else was already answered by the ADRs and
would have violated the "don't ask what the repo already answers" rule.

---

## 4. Final summary delivered (confirmed by user)

The orchestrator delivered a complete proposed architecture covering all 17 requested
sections plus the Mermaid data-flow, explicitly noted the two added choices (framework
and repo layout — both consistent with the ADRs and the user's picks), and confirmed no
existing ADR was contradicted. The user replied **"Confirm — create
docs/SYSTEM_ARCHITECTURE.md exactly to this specification."**

---

## 5. Deliverable produced

- **`docs/SYSTEM_ARCHITECTURE.md`** — created (514 lines) as the authoritative
  implementation architecture, replacing the empty stub.

Sections: 1. Architecture overview · 2. Component architecture · 3. Data-flow (Mermaid) ·
4. Component responsibilities · 5. Data models (TS) · 6. API/service contracts ·
7. AI-vs-deterministic matrix · 8. Optimization integration · 9. Frontend architecture ·
10. Error handling · 11. Security · 12. Performance · 13. Testing architecture ·
14. MVP/Stretch/Production scope · 15. Technology choices + rationale ·
16. Key architectural risks · 17. Implementation order & dependencies.

During writing, several textual artifacts (mojibake/leak tokens such as "theft",
"findAll", malformed headers, duplicated words) were introduced and then removed via
targeted scans; the final file is clean and structurally consistent.

---
## 6. Key principles re-confirmed

1. **AI proposes and reasons; deterministic systems validate and optimize.** The AI never
   votes on feasibility, geometry, compatibility, budget, placement, or scoring.
2. **One deterministic core = single source of correctness**, consumed in-browser; render
   equals catalog geometry by construction, so 3D/2D can never disagree with the BOM.
3. **Single anchored weighted-scalar objective** (`argmax Σ wᵢ·uᵢ`) with priority profile +
   bounded spaciousness modifier; Pareto enumeration deliberately out.
4. **Constructive, layered, constraint-first search** — archetype → SKU binding → wall-strip
   placement — never naive full-assembly enumeration.
5. **Targeted incremental re-optimization** (re-score / re-place / re-search) with full
   re-validation before surfacing.
6. **Trace-driven relaxation** as the source of the "impossible brief → 3 ways" demo wow,
   with an honest out-of-scope wall and never a hang or an invalid plan.

---

## 7. Open / deferred items

- `docs/PRODUCT_CATALOG_SCHEMA.md` is still an empty stub and is the next spec to write.
- `tasks/TASKS.md` does not yet exist; implementation task tracking needs to be created.
- Exact numeric rule values, weight tables, normalization anchors, and archetype templates
  are deferred (documented in architecture as configuration, not architecture).
- Catalog compatibility graph and substitution sets remain manually curated data.

---

## 8. Next steps

- Write `docs/PRODUCT_CATALOG_SCHEMA.md` (catalog data schema, compatibility graph,
  quarantine rules) consistent with the architecture's `engine/catalog` module.
- Create `tasks/TASKS.md` and `tasks/TODO.md` to record the implementation plan from
  §17 (Stage A: engine geometry + rules + schema) and deferred work.
- Begin Stage A of the deterministic core (geometry + rule engine + schema) with
  gate-enforced Vitest tests per ADR-017.

---

*End of session log. Consistent with `docs/PRD.md`, `docs/OPTIMIZATION_SPEC.md`,
`docs/DECISIONS.md`, and `docs/SYSTEM_ARCHITECTURE.md`.*
| ADR-018 | Product-credible on demo rails; explicit MVP/stretch/production scope |