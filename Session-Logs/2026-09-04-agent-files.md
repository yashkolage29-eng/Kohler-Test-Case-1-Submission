# Session Log — KOHLER AI Bathroom Designer & Planner (Specialist Agent Files)

**Session type:** Development workflow scaffolding — creation of specialist agent
instruction files for orchestrator→specialist delegation
**Date:** 2026-09-04
**Workspace:** `/Users/yashkolage/Downloads/kolher`
**Orchestrator:** Cline (Kimi K3 orchestrator role per `.clinerules/AGENTS.md`)
**Sources read first:** `docs/PRD.md`, `docs/SYSTEM_ARCHITECTURE.md`,
`docs/OPTIMIZATION_SPEC.md`, `docs/PRODUCT_CATALOG_SCHEMA.md`, `docs/DECISIONS.md`
(ADRs 001–019), `tasks/TASKS.md`, `.clinerules/AGENTS.md`, `.clinerules/rules.md`
**Outcome:** Created `agents/` with six specialist agent instruction files. No
production code was written; no other files were modified.

---

## 1. Objective of this session

With the core documentation complete (PRD, System Architecture, Optimization Spec,
Product Catalog Schema, Decisions, TASKS.md), create the `agents/` directory with six
narrowly-scoped specialist role definitions. These files will be used by the Kimi K3
orchestrator to delegate development work to GLM 5.3 specialist agents.

Constraints given by the user:

- Each file must define a specialist role, not a generic coding assistant.
- Each file must contain 10 sections: Role, Responsibilities, What the agent owns,
  What the agent must NOT modify, Required reading, Workflow before coding,
  Implementation principles, Testing responsibilities, When to escalate to Kimi,
  Expected output/report format.
- Do not duplicate PRD/SYS-ARCH/OPTIMIZATION_SPEC content — reference by section number.
- Keep files concise and operational (no essays).

## 2. Plan approved by the user

Plan mode was used to present the approach before act mode:

1. Read all source-of-truth docs first (done before planning).
2. Create six agent files, each with the exact 10-section template plus a shared
   "General rules" footer (the user's 10 general agent rules, condensed — kept inside
   each file so each is self-contained for delegation).
3. Anchor each role to concrete repo facts: package layout (`packages/engine|web|server`),
   relevant ADRs, spec sections, and the owners already named in `tasks/TASKS.md`.
4. Explicit file/module ownership and non-ownership per agent.
5. No other files changed.

The user confirmed the plan and switched to act mode.

## 3. Files created

| File | Scope highlights |
|---|---|
| `agents/product-agent.md` | Requirements, journeys, recommendation behavior, catalog-data curation. Owns `packages/engine/src/catalog/data/**` only. Never touches geometry/architecture; never invents specs. |
| `agents/architecture-agent.md` | Component boundaries, data flow, contracts, trade-offs. Owns new/superseding ADR drafts in `docs/DECISIONS.md`. Any change contradicting an accepted ADR is an automatic escalation. No routine feature implementation. |
| `agents/geometry-agent.md` | Deterministic spatial core: wall-strip + authoritative AABB collision (ADR-003), clearances, door/window conflicts, slot-grid placement. CRITICAL rule: geometry validity is deterministic; LLM never decides. Tests-first for every rule incl. determinism/hash tests. |
| `agents/backend-agent.md` | Engine modules (catalog/solver/optimize/relaxation/receipt) + thin Node server + NIM proxy with offline fallback. Quarantine-over-crash, determinism contract, `B_max` relaxable only via explicit path, ADR-017 Vitest gates, ~2 s latency. |
| `agents/frontend-agent.md` | Owns `packages/web/**`. `render = catalog geometry` non-negotiable; framework-free TS + Canvas 2D + three.js (no new deps without escalation); Impeccable loop; loading/empty/error/impossible-brief states. |
| `agents/qa-agent.md` | Adversarial mandate: break implementations. Prioritized attack surfaces: geometry failures, budget violations, compatibility failures, invalid input, relaxation abuse, determinism attacks, AI/API failures, UI failures, security, performance. Owns only its own test files; never weakens existing tests (critical finding if it sees that). |

## 4. Design decisions made in this session

| Decision | Rationale |
|---|---|
| Self-contained files (General Rules repeated in each) vs a shared file | Each file is pasted into a fresh GLM 5.3 delegation context; self-containment beats DRY for agent instructions. |
| Ownership expressed as concrete paths (`packages/engine/src/catalog/data/**` etc.) | Makes "stay in scope" mechanically checkable instead of aspirational. |
| Fixed report format per agent (What Changed / Files / Tests / Assumptions / Failures / Open Questions) | Enforces AGENTS.md §6 review: the orchestrator can verify rather than trust agent claims. |
| QA owns only test files and must never fix production code | Keeps adversarial separation of concerns; fixes route back to the owning agent. |
| Escalation triggers role-specific and explicit (e.g. architecture: any ADR contradiction → always escalate) | Prevents the most dangerous silent failure mode: an agent overstepping accepted decisions. |
| Spec content referenced by section number (OPT §5, ADR-003, PRD §12, SCHEMA §9) | Keeps files ~100 lines, avoids drift, forces agents to read the source of truth. |

## 5. Verification

- `ls agents/` confirms all six files exist.
- Line counts: 98–121 lines each (644 total) — within the "concise, operational" budget.
- Cross-checked filenames against owner names already used in `tasks/TASKS.md`
  (`backend-agent`, `product-agent`) — consistent.

## 6. Scope control / notes

- No production code, docs, or TASKS.md changes. A TASKS.md entry was deliberately
  not added (documentation scaffolding, not an implementation task); the user may
  request one.
- Next logical task per TASKS.md: T-002 — implement
  `packages/engine/src/catalog` (backend-agent), delegable using
  `agents/backend-agent.md` directly.
