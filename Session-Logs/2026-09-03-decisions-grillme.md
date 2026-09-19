# Session Log — KOHLER AI Bathroom Designer & Planner (Decision Log Grill-me)

**Session type:** Architecture & technical decision definition via Grill-me
**Date:** 2026-09-03
**Workspace:** `/Users/yashkolage/Downloads/kolher`
**Sources read first:** `docs/PRD.md`, `docs/OPTIMIZATION_SPEC.md`, `.clinerules/AGENTS.md`,
`.clinerules/rules.md` (no root-level `CLAUDE.md` exists — AGENTS/rules live in `.clinerules/`),
`docs/DESIGN_SESSION_LOG.md`
**Outcome:** Created the authoritative `docs/DECISIONS.md` (18 ADRs) after a structured
one-question-at-a-time interrogation and explicit user confirmation.

---

## 1. Objective of this session

Before writing `docs/DECISIONS.md`, run a **Grill-me** interview (one question at a time) to:

- Identify the major product, architectural and technical decisions that materially affect the
  architecture, technical execution, innovation, reliability, UX or feasibility of the KOHLER
  Bathroom Designer.
- Challenge each decision one at a time — assumptions, trade-offs, unnecessary complexity,
  hackathon time constraints, the 45% Innovation criterion.
- Prefer technically defensible decisions over impressive-sounding ones.
- Record **only** decisions actually discussed and agreed upon; do not fabricate entries.

Per the explicit instruction, **no DECISIONS.md was written until the user confirmed** the full
summary. DECISIONS.md was created only after the user selected "Confirm all — create
docs/DECISIONS.md now with these 18 ADRs".

---

## 2. Prior context discovered

- The repo holds authoritative source-of-truth docs: `docs/PRD.md` (approved MVP, decision log
  D1-D12) and `docs/OPTIMIZATION_SPEC.md` (approved engine spec, from
  `docs/DESIGN_SESSION_LOG.md` Q1-Q16).
- `AGENTS.md` asserted the core thesis: *"AI proposes and reasons; deterministic systems validate
  and optimize. The LLM must never be the final authority for physical feasibility, dimensions,
  compatibility or budget calculations."*
- `docs/DECISIONS.md` existed as an **empty 0-byte stub** — the artifact this session fills.
- Evaluation weights include **Approach & Innovation 45%** — a recurring tension in the grill.
- Because the PRD and Optimization Spec already encode product + engine decisions, the session
  treated them as the default baseline and surfaced the *genuine open tension* behind each
  decision rather than starting from a blank slate.

---

## 3. Decisions settled (one per ADR, 18 total)

| ADR | Decision | Chosen approach |
|-----|----------|-----------------|
| ADR-001 | Overall system architecture | Client-side pure-TS engine + thin Node server (single source of truth) |
| ADR-002 | AI vs deterministic logic | Bounded AI, made visibly intelligent |
| ADR-003 | Bathroom spatial representation | Wall-strip search + authoritative 2D AABB collision layer |
| ADR-004 | Candidate generation | Deterministic constructive layered CSP (no stochastic search) |
| ADR-005 | Optimization methodology | Scalar weighted objective + priority weight-profiles for "3 ways" |
| ADR-006 | Multi-objective / Pareto composition | Priority base profile + bounded spaciousness modifier; conflicts surfaced & narrated |
| ADR-007 | Constraint validation & rule engine | Hybrid declarative-metadata + imperative evaluators; first-class fired-rule trace |
| ADR-008 | Product catalog / data architecture | Typed JSON/TS + strict schema + quarantine; rule-defaults + authoritative override compat graph |
| ADR-009 | Image / layout understanding | Photo = qualitative seed/taste/narration; geometry always user-confirmed |
| ADR-010 | 2D visualization | Canvas 2D = projection of engine AABB + trace; 3D toggle included |
| ADR-011 | Backend / frontend boundaries & tech stack | TS + Vite; framework-free engine; three.js + Canvas 2D; thin Node built-in server; Vitest |
| ADR-012 | Database / storage | No DB — file-based catalog (via ADR-008); in-memory session state |
| ADR-013 | AI model usage & offline fallback | Kimi K3/NIM default behind thin .env-switchable adapter; always-on offline fallback |
| ADR-014 | Explainability | Receipt-traceable AI narration + visible decision-receipt panel |
| ADR-015 | Infeasible-solution handling | Full trace-driven relaxation menu + 1-3 provably-valid plans + honest failure wall |
| ADR-016 | Performance & scalability | Coarse component-level caching + instant re-score + bounded backtracking; cached 2D & 3D renders |
| ADR-017 | Testing strategy | Gate-enforced Vitest suite incl. injected-invalid rejection, determinism, relaxation, oracle, latency |
| ADR-018 | Prototype vs production trade-offs | Product-credible demo-critical rails; explicit deferred scope |

---
---

## 4. Question-by-question interview record (the grill)

Each entry shows the question asked, the user's answer, and the consequence.

### Q1 — AI authority vs. demo "innovation" credit (strategic root)
**Question:** Too-deterministic reads as a constraint solver (forfeit innovation); too-much-AI
violates D2 and the offline/no-key guarantee. Options: A) strict bounded boundary made visibly
AI; B) elevate AI's visible role (AI proposes 2-3 intents, engine selects); C) AI emits
non-validated décor suggestions.
**Recommended:** A, with an on-screen AI reasoning panel to earn the 45% credit by *presenting*
the bounded architecture. C rejected outright (scope, breaks honesty).
**User answer:** "option a"
**Consequence:** Locked ADR-002 — bounded AI, made visibly intelligent. AI never decides
feasibility/geometry/compatibility/cost.

### Q2 — Overall system architecture / where the deterministic core lives
**Question:** A) engine in-browser (pure TS), thin server serves + proxies AI; B) Node backend
hosts engine; C) hybrid engine-with-fallback (two implementations = drift risk).
**Recommended:** A, structured as monorepo `engine // web // server // ai` for a credible story
while keeping a single source of truth.
**User answer:** "confirm option a"
**Consequence:** Locked ADR-001.

### Q3 — Bathroom spatial fidelity
**Question:** A) strict 1D wall-strip; B) wall-strip search + authoritative 2D AABB collision
layer; C) full 2D rotated polygon (SAT).
**Recommended:** B — closes corner/adjacent-wall 2D blind spots with bounded complexity.
**User answer:** "option b"
**Consequence:** Locked ADR-003.

### Q4 — Candidate generation: constructive vs. metaheuristics
**Question:** A) constructive layered CSP (valid by construction); B) GA/simulated annealing;
C) AI emits coordinates.
**Recommended:** A — B breaks the determinism contract; C violates ADR-002.
**User answer:** "option a"
**Consequence:** Locked ADR-004.

### Q5 — Optimization methodology: scalar vs. Pareto-aware
**Question:** A) pure scalar; B) scalar + deterministic priority weight-profiles for "3 ways";
C) true Pareto-front browsing.
**Recommended:** B — three architecturally distinct valid plans, single traceable objective.
**User answer:** "option b"
**Consequence:** Locked ADR-005.

### Q6 — Constraint validation: rule-engine shape
**Question:** A) imperative validation functions; B) declarative config + generic interpreter;
C) hybrid declarative-metadata + imperative evaluators with a first-class fired-rule trace.
**Recommended:** C — B risks non-deterministic/untestable code-in-config.
**User answer:** "option c"
**Consequence:** Locked ADR-007.

### Q7 — Product catalog & data architecture
**Question:** Storage A) JSON/TS files; B) SQLite; C) build-generated JSON. Compatibility i)
explicit pairs; ii) rule-derived; iii) rule-derived defaults + authoritative explicit overrides.
**Recommended:** A + iii, schema-validated with quarantine.
**User answer:** "confirm"
**Consequence:** Locked ADR-008 (also set the storage direction for ADR-012).

### Q8 — Image/layout understanding: what does a photo drive?
**Question:** A) photo = qualitative seed/taste/narration only (geometry user-confirmed); B) photo
proposes a layout to accept/edit; C) full auto-measurement authority.
**Recommended:** A as core; B only as a stretch feature. C rejected (correctness-from-vision = D2
killer).
**User answer:** "option a"
**Consequence:** Locked ADR-009.

### Q9 — Multi-objective composition: priority + spaciousness knobs
**Question:** A) literal two-knob re-weight; B) priority base profile + bounded spaciousness
modifier on the space term, conflicts surfaced & narrated; C) Pareto-style handling.
**Recommended:** B — physics honest, conflicts explainable.
**User answer:** "option b"
**Consequence:** Locked ADR-006.

### Q10 — 2D visualization approach
**Question:** A) Canvas 2D drawn directly from engine AABB + trace; B) 2D from the three.js
scene; C) separate floorplan library (drift risk).
**Recommended:** A.
**User answer:** "go with option a but let there be a toggle for the 3d view as well"
**Consequence:** Locked ADR-010 — Canvas 2D projection, with a 3D toggle.

### Q11 — Tech stack & backend/frontend boundary
**Question:** A) minimal TS stack (Vite, framework-free engine, three.js + Canvas, Node built-in
HTTP, Vitest); B) React + state layer; C) other framework/server framework.
**Recommended:** A — least install/build/run surface for an offline judge machine.
**User answer:** "option a"
**Consequence:** Locked ADR-011.

### Q12 — AI model selection & offline fallback guarantees
**Question:** A) Kimi K3/NIM default behind a thin stable adapter, .env-switchable, always-on
deterministic offline fallback; B) model-agnostic multi-provider abstraction; C) drop the remote
LLM.
**Recommended:** A — a single change-point is swappable enough; B over-engineers; C forfeits the
ADR-002 innovation credit.
**User answer:** "option a"
**Consequence:** Locked ADR-013.

### Q13 — Explainability: the two-layer contract
**Question:** A) strict factual narration (receipt-traceable); B) A + a visible decision-receipt/
comparison panel; C) loose free-form explanation.
**Recommended:** B — determinism becomes demonstrable on screen.
**User answer:** "option b"
**Consequence:** Locked ADR-014.

### Q14 — Infeasible-solution handling (the demo wow)
**Question:** A) full trace-driven relaxation protocol (fail-cause trace -> hand-ordered menu ->
1-3 provably-valid plans + honest failure wall); B) simplest graceful message; C) user manually
picks trade-offs.
**Recommended:** A — the demo spine and a large part of the 45% innovation credit.
**User answer:** "option a"
**Consequence:** Locked ADR-015.

### Q15 — Performance & scalability
**Question:** A) coarse component-level caching + instant re-score + bounded backtracking;
B) fine-grained caching; C) no caching, always full re-search.
**Recommended:** A.
**User answer:** "option a but let it keep caching to make the both 2d and 3d renders faster"
**Consequence:** Locked ADR-016 — with render (2D + 3D) caching explicitly added.

### Q16 — Testing strategy
**Question:** A) full gate-enforced Vitest suite incl. injected-invalid rejection, determinism,
relaxation/3-ways, priority oracle, anchors, edge cases, ~2s latency timer; B) spot-checks only;
C) heavy property-based fuzzing.
**Recommended:** A — institutionalizes the "no invalid output" guarantee.
**User answer:** "option a"
**Consequence:** Locked ADR-017.

### Q17 — Prototype vs production trade-offs (final framing)
**Question:** A) product-credible demo-critical rails, explicit deferred scope; B) max
production-grade everywhere; C) demo-optimized around one scripted demo.
**Recommended:** A — robustness over breadth; documented scope reads as seniority.
**User answer:** "option a"
**Consequence:** Locked ADR-018. The decision frontier was then empty — all 18 areas settled.

---

## 5. Final summary delivered (confirmed by user)

The grill ended with a complete summary of all 18 decisions. Cross-cutting commitments locked:

- **Determinism is load-bearing:** `hash(inputs)->hash(plan)`; no RNG/wall-clock/keys/network
  dependency.
- **No invalid output on any path** is the differentiator, enforced by a gate-enforced test
  regime, not hope.
- **AI authority strictly bounded** to taste-to-features, curation, narration — never geometry/
  feasibility/compatibility/cost.
- **Offline, no-keys, `npm install && run`** on a judge-grade machine is non-negotiable; remote AI
  (NIM) is an enhancement, never a dependency.
- **The "impossible brief -> show me 3 ways"** is the demo spine.

The user selected **"Confirm all — create docs/DECISIONS.md now with these 18 ADRs"**, authorizing
the write-up.

---

## 6. Deliverable produced

- **`docs/DECISIONS.md`** — created (910 lines), replacing the empty stub. Format: document-status
  preamble, a Decision Index table, and 18 ADR entries (ADR-001..ADR-018), each with the sections
  Status / Context / Options Considered / Decision / Rationale / Alternatives Rejected /
  Consequences / Implementation Impact. Verified: 18 ADR headings, 18 of each section header,
  no formatting corruption.

---

## 7. Next steps

- Fill the remaining empty specs (`SYSTEM_ARCHITECTURE.md`, `PRODUCT_CATALOG_SCHEMA.md`) aligned
  with DECISIONS.md — with their own Grill-me sessions if required.
- Plan implementation tasks in `tasks/TASKS.md`.
- Begin with the deterministic core: rule engine + catalog + feasibility search, then the AI and
  rendering layers (per AGENTS.md delegation workflow).

---

*End of session log.*
