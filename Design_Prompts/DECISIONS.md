# Architecture & Product Decisions

> **Document status:** Historical decision log for the KOHLER AI Bathroom Designer &
> Planner. This is where architectural, product and technical decisions are recorded so
> future work is auditable and self-consistent.
>
> **It is NOT a requirements document.** For authoritative product behavior see
> `docs/PRD.md`; for the optimization engine see `docs/OPTIMIZATION_SPEC.md`. This file
> records *why* decisions were made and which trade-offs were accepted — it never
> restates the PRD or the Optimization Spec.
>
> **Convention:** Future decisions are appended as new ADRs. Old decisions are not silently
> rewritten; if a decision changes, a new ADR supersedes it and references the one it replaces.

---

## Decision Index

| ID | Decision | Status |
|----|----------|--------|
| ADR-001 | Overall system architecture | Accepted |
| ADR-002 | AI vs deterministic logic | Accepted |
| ADR-003 | Bathroom spatial representation | Accepted |
| ADR-004 | Candidate generation | Accepted |
| ADR-005 | Optimization methodology | Accepted |
| ADR-006 | Multi-objective / Pareto composition | Accepted |
| ADR-007 | Constraint validation & rule engine | Accepted |
| ADR-008 | Product catalog / data architecture | Accepted |
| ADR-009 | Image / layout understanding | Accepted |
| ADR-010 | 2D visualization | Accepted |
| ADR-011 | Backend / frontend boundaries & tech stack | Accepted |
| ADR-012 | Database / storage | Accepted |
| ADR-013 | AI model usage & offline fallback | Accepted |
| ADR-014 | Explainability | Accepted |
| ADR-015 | Infeasible-solution handling | Accepted |
| ADR-016 | Performance & scalability | Accepted |
| ADR-017 | Testing strategy | Accepted |
| ADR-018 | Prototype vs production trade-offs | Accepted |
| ADR-019 | Catalog schema concrete decisions (compat default rule, mounting tags, units, water metadata, finish pricing) | Accepted |
| ADR-020 | Two explicit “3 ways” modes | Accepted |
| ADR-021 | Monorepo scaffold conventions (ESM/module resolution, tooling hoist, root scripts) | Accepted |
| ADR-022 | Shared contract location/ownership, priority spelling, engine type purity boundaries | Accepted |
| ADR-023 | Catalog load-time bbox check window (§6.3 tolerance convention for mixed offset origins) | Accepted |
| ADR-024 | Geometry rule models for C2–C6 (T-006) | Accepted |
| ADR-025 | C7 feature-constraint semantics (T-007) | Accepted |
| ADR-026 | Deterministic finish resolution and the u_luxury/u_maintenance point scales (T-009) | Accepted |
| ADR-027 | Relaxation protocol deviation: typed diagnosis + catalog param in `relax()` (T-010) | Accepted |
| ADR-028 | Candidate-set cache keys, weight-only re-score, and local-edit full-re-search fallback (T-011) | Accepted |

---
## ADR-001 — Overall System Architecture

### Status
Accepted

### Context
The product must run on a judge-grade machine, offline, with no API keys and no GPU
(PRD N1/N2), produce an interactive 2D/3D experience (three.js + Canvas), and use a
NIM-hosted AI model that degrades gracefully to an offline fallback. The load-bearing
question was *where the deterministic engine runs*, because that choice controls the
offline guarantee, the single source of truth for correctness, and how credible the
architecture reads.

### Options Considered
1. Single app, engine in the browser — deterministic core as a pure, framework-free
   TypeScript module consumed directly by a static frontend; a thin Node server serves
   assets and proxies AI calls with an offline fallback path.
2. Node backend hosts the engine — engine behind a REST/WebSocket API, browser renders
   only.
3. Hybrid engine-as-a-service with local fallback — try a backend endpoint, silently
   fall back to the in-browser engine if unavailable.

### Decision
Option 1: a monorepo with a pure TypeScript engine package (zero UI dependencies)
consumed by a web package, plus a minimal Node server for static serving, AI proxying
and the offline fallback. The deterministic engine is the single authoritative core.

### Rationale
- Single source of truth for correctness (D2) is structurally guaranteed — same engine
  on every path.
- Offline, no-key, npm-install-and-run (N1/N2) is trivially satisfied, with no backend
  round-trip in the hot path.
- The clean engine/web/server/ai boundary still provides a credible architectural story
  without the deployment weight of a real backend.
- Regenerations at target latency (~2s, ADR-016) are eased by running in-process.

### Alternatives Rejected
- Backend-hosted engine (2): cleaner product story but heavier to run on a judge
  machine, adds async latency and failure modes, and complicates the offline story.
  A minimal Node server is enough to earn the review narrative.
- Dual-path (3): two implementations of the same engine create drift risk — two sources
  of truth for correctness, exactly the thing ADR-002/D2 punishes.

### Consequences
- The engine must be kept free of framework/UI coupling to stay portable and testable.
- The frontend carries three.js and Canvas rendering load; acceptable since rendering is
  inherently client-side.
- A later restructuring toward a real backend would require extracting the engine,
  which is isolated in its own package by design.

### Implementation Impact
- Repo layout (engine/web/server/ai packages), build/packaging, test placement, offline
  run path.

---
## ADR-002 — AI vs Deterministic Logic

### Status
Accepted

### Context
45% of review weight is Innovation. Two opposing failure modes exist: too deterministic
reads as a glorified constraint solver and forfeits innovation credit; too much AI
authority violates the product thesis (D2 — correct buildability is the differentiator)
and breaks offline/no-key reliability. This is the strategic root that shapes all
downstream decisions.

### Options Considered
1. Strict boundary (PRD D5 / OPT Q16) — deterministic core is the sole authority for
   feasibility, geometry, compatibility and cost; AI confined to taste-to-features,
   curation and narration. Structural AI-proposes-within-a-provably-valid-set innovation.
2. Elevate AI's visible role — AI proposes 2-3 candidate feature-sets/layout intents
   that the engine validates and selects.
3. AI emits non-validated decor suggestions — style accents, tones, flair that bypass
   the validator.

### Decision
Option 1: bounded AI, made visibly intelligent. Authority stays strictly bounded; effort
goes into making the bounded AI contribution obvious on screen (an AI reasoning panel:
taste-to-features as reasoning, measured trade-off narration, the decision receipt).

### Rationale
- Reliability is the differentiator (D2); no invalid output on any path is non-negotiable.
- The architecture (AI proposing within a provably valid set) *is* the innovation and is
  technically defensible, unlike generative wow.
- The 45% Innovation credit is earned by presenting the bounded-AI architecture
  convincingly, not by widening AI authority at the cost of correctness.

### Alternatives Rejected
- Option 2: risks the engine rejecting the AI's top proposal (confusing UX) and adds
  integration complexity for marginal credibility gain.
- Option 3: weakens the audit-clean render-equals-BOM story, adds scope, and dilutes the
  honesty framing. Rejected outright.

### Consequences
- Every AI output is validated/constrained; the AI can never emit an unvalidated final
  plan.
- A visible reasoning panel is a required UI investment (see ADR-014).
- Plan determinism is independent of the AI layer.

### Implementation Impact
- ai module contracts, the reasoning panel, the hard rule that AI never contributes
  feasibility/geometry/compatibility/cost.

---

## ADR-003 — Bathroom Spatial Representation

### Status
Accepted

### Context
The engine must validate clearances, door swings, zones and plumbing, and place fixtures.
The representation governs how easy correctness, collision detection and the honest 2D
view are to achieve. The Optimization Spec prescribes a wall-strip model (OPT Q4) with
CSP backtracking on a ~25mm slot grid (OPT Q5).

### Options Considered
1. Strict wall-strip/1D model — walls as 1D strips, keep-clear regions subtracted,
   fixtures as intervals along a wall with footprint length + depth.
2. Hybrid wall-strip + explicit 2D AABB collision layer — 1D strips for placement/order/
   search speed, plus fixtures as 2D axis-aligned bounding boxes in room coordinates with
   real rectangle-overlap checks for clearance, collision and door-swing arcs.
3. Full 2D rotated polygon placement — arbitrary orientation with SAT-style overlap.

### Decision
Option 2: wall-strip 1D order/search, with fixture AABBs in room coordinates performing
the authoritative overlap/clearance/door-swing validation.

### Rationale
- Retains the fast deterministic search core while closing the real 2D blind spots
  (corner/adjacent-wall overlaps, L-shape interaction) that a pure 1D model has.
- Adversarial review (or the impossible-brief demo) could expose these blind spots;
  AABBs are the cheap fix that buys genuine physical validity.
- Still fully deterministic and fast enough for the ~2s contract.

### Alternatives Rejected
- Strict 1D (1): historically weak at true 2D conflicts; undermines credibility.
- Full 2D polygon (3): complexity explodes, slower, harder to prove deterministic
  correctness, overkill for rectangle/L-shape MVP rooms.

### Consequences
- Engine AABBs must exactly match drawn geometry for the render-equals-geometry claim
  (ADR-010).
- The 2D collision layer is part of the authoritative validator, not a visualization
  helper.

### Implementation Impact
- Geometry module, collision/clearance validation, placement search, render source.

---
## ADR-004 — Candidate Generation

### Status
Accepted

### Context
The engine must produce valid, scored candidates to feed the weighted objective. Under a
45% innovation rubric the temptation is to bolt on a smart stochastic solver (genetic
algorithm, simulated annealing), which collides with the determinism and reliability
pillars.

### Options Considered
1. Constructive layered CSP search — class-selection, SKU-binding, placement-solving,
   with constraint propagation, forward-checking, bounded backtracking and deterministic
   tie-breaks. Valid by construction.
2. Stochastic metaheuristic — GA / simulated annealing / randomized local search for
   placement optimization.
3. AI proposes coordinates — the LLM emits a layout, the engine only validates.

### Decision
Option 1: deterministic constructive layered CSP, self-contained, no stochastic search.

### Rationale
- Every emitted candidate is valid by construction — the core promise.
- Deterministic (OPT Q15: hash(inputs) to hash(plan) is stable), bounded runtime (~2s),
  and maps cleanly to the relaxation menu (ADR-015).
- No exotic solver libraries, matching OPT section-17 (self-contained, offline, no keys).

### Alternatives Rejected
- Option 2: breaks the determinism contract (any RNG/randomness kills reproducible
  outputs), is harder to bound for ~2s, and is harder to prove every emitted plan valid.
- Option 3: AI decides buildability, directly violating ADR-002 and OPT Q16; also
  non-deterministic, slow and expensive. Rejected at the root.

### Consequences
- Innovation credit for the solver comes from layering and relaxation explainability,
  not randomized search.
- Search is sound but not necessarily complete — it finds good valid candidates, not a
  proven global optimum. Accepted and narratable.

### Implementation Impact
- The core search module, constraint propagation, deterministic tie-breaking,
  backtracking budget.

---

## ADR-005 — Optimization Methodology

### Status
Accepted

### Context
The Optimization Spec (OPT section-1) defines a single normalized weighted scalar
objective. The demo, however, needs three genuinely different plans via show-me-3-ways
(OPT Q9/Q14), creating tension: a single scalar yields one best candidate, and
relaxation-based alternatives (ADR-015) differ by trade-offs rather than by distinct
valid intents.

### Options Considered
1. Pure scalar as written — single weighted sum; 3-ways produced outside the objective
   via the relaxation menu.
2. Scalar + priority-derived alternative weight profiles — base scalar for the headline
   plan; 3-ways generated from deliberately different deterministic weight profiles
   (e.g., luxury/eco/value-heavy), each valid and highest-scoring for its own profile.
3. True Pareto-front optimization — enumerate/sample the non-dominated frontier and let
   the user browse.

### Decision
Option 2: a single weighted-scalar objective, with 3-ways generated as a fixed set of
deterministic priority-level alternative weight profiles, each re-scored and
independently validated.

### Rationale
- Keeps one objective function, so every artifact traces back to it (OPT section-1)
  and the determinism/priority-oracle tests stay clean.
- Gives three architecturally distinct valid plans for the demo — far richer than three
  relaxation deltas.
- Deterministic, bounded, testable, and narratable as measured trade-offs.

### Alternatives Rejected
- Pure scalar (1): under-delivers on the demo 3-ways richness.
- True Pareto (3): heavier, risks determinism/bounded/~2s guarantees, and contradicts
  the one-priority-at-a-time simplicity (one scalar, one knob). Over-engineering for a
  hackathon.

### Consequences
- 3-ways shares the same scoring engine; each alternative is still fully validated.
- Requires a deterministic, sufficiently-separated set of weight-profile definitions
  (config).

### Implementation Impact
- Objective function, normalization anchors, priority weight profiles, the 3-ways
  route.

---

## ADR-006 — Multi-Objective / Pareto Composition

### Status
Accepted

### Context
The spec has a primary priority knob (value/balance/luxury/eco-low-maintenance) driving
the weight table and an orthogonal spaciousness knob (compact/balanced/airy)
re-weighting the space term (OPT section-5, Q13). These can fight each other (e.g., airy
in a tiny room; eco vs. luxury on finish/water terms). The composition must keep physics
honest and explainable.

### Options Considered
1. Literal two-knob weight composition — both knobs adjust the same 5-term weights; when
   they conflict the composite lands wherever the weights lead.
2. Priority base profile + documented bounded spaciousness modifier — priority is the
   driver; spaciousness applies only a bounded, documented modifier to the space/footprint
   term, and infeasible combinations surface as explicit, narrated trade-offs.
3. Separate Pareto-style handling of the two knobs.

### Decision
Option 2: priority sets the base weight profile; spaciousness applies a bounded,
documented modifier to the space term only; conflicts are surfaced and narrated as
measured trade-offs.

### Rationale
- Keeps the single-scalar model (ADR-005) intact while making interplay deterministic.
- Airy-in-a-tiny-room and eco-vs.-luxury become explicit explained trade-offs — demo gold
  and consistent with ADR-002/ADR-014.
- Simple to implement (config-defined bounds) and to test.

### Alternatives Rejected
- Option 1: conflicts silently degrade with no explanation (missed explainability
  opportunity).
- Option 3: Pareto treatment over-invests and breaks the one-scalar/one-priority model.

### Consequences
- A constraint-tension detection surfaces in narration when knobs conflict.
- Requires config-defined modifier bounds and their stability contract.

### Implementation Impact
- Weight tables, spaciousness modifier config, trade-off narration, tests.

---
## ADR-007 — Constraint Validation & Rule Engine

### Status
Accepted

### Context
The rule engine is the enforcement of the buildable-equals-differentiator promise (D2).
The spec calls for ~25-40 deterministic Pune-flavored rules (clearances, door swings,
zones, plumbing, compatibility, budget) with a fired-rule trace (OPT Q8, section-0).

### Options Considered
1. Imperative validation functions — hardcoded TS functions, one validatePlan() pass.
2. Declarative rule config + generic rule engine/interpreter — rules as data evaluated
   by a generic engine.
3. Hybrid: declarative metadata + imperative evaluators — each rule is type-safe code
   keyed to a config entry {id, category, weight, message, params}; the engine iterates
   registered evaluators and returns a per-rule verdict plus a structured fired-rule trace.

### Decision
Option 3: hybrid. Rules are registered through declarative metadata but implemented as
type-safe imperative evaluators, producing a by-rule verdict and a first-class
fired-rule trace.

### Rationale
- Rules stay type-safe, testable, obvious code while being registered declaratively —
  the rule set is inspectable, countable, and the trace is first-class (gates ADR-014
  and ADR-015).
- Avoids embedding near-Turing-complete logic in data, which is strictly worse than code.

### Alternatives Rejected
- Pure imperative (1): works but the fired-rule trace becomes ad hoc and the rule set is
  a stat rather than a structure.
- Full declarative (2): to handle real clearance math/swing arcs/budget sums a generic
  interpreter needs near-Turing-complete predicates — code-in-config, worse testing and
  determinism.

### Consequences
- Validation is uniformly structured; every emitted plan returns a per-rule verdict +
  trace.
- Relaxation diagnostics (ADR-015) consume the trace directly.

### Implementation Impact
- Rule registry, evaluators, the trace data structure, validator output consumed by
  UI/narration.

---

## ADR-008 — Product Catalog / Data Architecture

### Status
Accepted

### Context
The spec requires ~40-80 curated real KOHLER SKUs, a compatibility graph, substitution
sets for relaxation (ADR-015), and quarantine-on-missing-data (OPT Q12).

### Options Considered
(Storage)
1. Plain type-checked JSON/TS data files — a curated, schema-validated catalog loaded at
   startup; missing mandatory field -> quarantined.
2. SQLite embedded catalog with a query layer.
3. Build-generated optimized JSON from readable TS fixtures.

(Compatibility representation)
- i. Explicit pair/adjacency table.
- ii. Rule-derived compatibility computed at load.
- iii. Rule-derived defaults + curated explicit override graph (authoritative).

### Decision
Storage Option 1 (plain type-checked JSON/TS data files, strict schema-validated at load
with quarantine), with compatibility Option iii (rule-derived defaults plus an
authoritative curated explicit-override graph, consistency-checked at load).

### Rationale
- For a static 40-80 SKU demo set, a real DB is pure overhead and an install/offline
  risk; the rigor that matters is schema validation, quarantine, and a defined
  compatibility model — that is data-architecture, not infrastructure.
- Rule-derived defaults keep authoring cheap; the explicit override graph guarantees the
  compatibility story is authoritative, auditable and cannot silently drift
  (protecting no-invalid-output).

### Alternatives Rejected
- SQLite (2): native dependency + migrations + install friction on a judge machine,
  outweighs stack credibility for a static set.
- Full rule-derived compatibility (ii): risk of silent unexpected incompatibility if the
  rules are wrong — breaks the no-invalid-output guarantee.

### Consequences
- Catalog is auditable, diffable and versionable; the override graph is
  consistency-checked.
- Quarantine produces data-gap records surfaced in the decision receipt.

### Implementation Impact
- Catalog schema, load-time validation/quarantine, compatibility graph + consistency
  check, substitution sets.

---

## ADR-009 — Image / Layout Understanding

### Status
Accepted

### Context
Photo input is a headline feature (PRD D3: Photo seeds; dimensions decide; user
confirms) and the NIM Kimi K3 model is multimodal. The question is how much authority a
photo should have over the plan, given the determinism + honesty foundations (ADR-002,
OPT Q16) and the no-key offline machine requirement.

### Options Considered
1. Photo-equals-inspiration/seed only — AI vision reads qualitative signals (style,
   present fixtures, finish, tone) that feed taste-to-features and narration; all
   authoritative geometry comes from explicit, user-confirmed numeric entry.
2. Photo proposes a candidate layout the user can accept or edit, validated by the
   engine.
3. Photo-equals-full auto-measurement authority — vision infers dimensions and the
   engine trusts them.

### Decision
Option 1: photo is a qualitative seed + taste signal + narration source. Geometry is
always user-confirmed numeric entry.

### Rationale
- Fully deterministic and honest; identical behavior online/offline.
- Dimensions-decide, user-confirms (D3) is honored exactly; no measurement-precision
  risk; the no-key offline machine is unaffected.
- The vision value is real but qualitative/narrative, which is honest.

### Alternatives Rejected
- Option 2: geometric wow only if vision is reliable — it isn't under a no-key
  constraint, and a validated-but-rejected proposal is confusing UX. Only acceptable
  later as a non-blocking stretch feature.
- Option 3: makes correctness-critical dimensions depend on probabilistic vision — the
  D2 killer. Rejected outright.

### Consequences
- The AI never contributes a number that becomes a hard constraint.
- The photo demo value is demonstrated via qualitative understanding and taste mapping.

### Implementation Impact
- Multimodal prompt design, taste-to-feature extraction, narration, offline fallback
  handling of photo (best-effort).

---
## ADR-010 — 2D Visualization

### Status
Accepted

### Context
The default visual is an annotated 2D floor plan derived from catalog geometry (OPT
output-4), beside the procedural 3D. The 2D must be honest — exactly matching the
engine's AABB geometry — cheap, deterministic, and not drift-prone, with annotations
tied to the rule trace.

### Options Considered
1. Canvas 2D drawn directly from the engine's AABB geometry + fired-rule trace.
2. 2D as an orthographic projection of the three.js scene.
3. A separate SVG/floorplan library independent of both engine and three.js.

### Decision
Option 1: Canvas 2D as a direct projection of the engine AABB model + fired-rule trace,
with a toggle to the 3D procedural view.

### Rationale
- Render-equals-validated geometry by construction (audit-clean); no second model of the
  room.
- Lightweight, deterministic, trivially offline, cheap to build.
- The 3D toggle satisfies the honest 3D/2D representation promise (PRD section-2) while
  2D stays a pure projection of the validated model.

### Alternatives Rejected
- Option 2: elegant but couples 2D to the 3D scene lifecycle; more coupling than needed.
- Option 3: a third model of room geometry that can silently drift from the engine's
  model — the exact drift the render-equals-BOM claim punishes.

### Consequences
- 2D and 3D rendering both derive from the same validated geometry so they stay
  consistent.
- Annotations (dim lines, clearance callouts) come from the trace module's data.

### Implementation Impact
- Canvas 2D renderer, annotation rendering, 2D/3D toggle, render caching (ADR-016).

---

## ADR-011 — Backend / Frontend Boundaries & Tech Stack

### Status
Accepted

### Context
ADR-001 fixed the architecture (client-side pure-TS engine + thin Node server). This ADR
fixes the concrete libraries and patterns, honoring offline/no-key (N1/N2), the ~2s
regenerate (N3), and the Canvas 2D + three.js 3D visuals (ADR-010).

### Options Considered
1. Minimal typed stack — TypeScript everywhere; engine = framework-free pure TS; web =
   Vite + TS; three.js 3D; Canvas 2D; Node built-in HTTP for the thin server; Vitest.
2. React + Vite SPA with a global-state layer, three.js, Tailwind.
3. Other framework / opinionated server framework (Svelte/Preact/Vue, Express/Fastify),
   CSS framework.

### Decision
Option 1: TypeScript everywhere; Vite; framework-free pure-TS engine; three.js + Canvas
2D; thin Node built-in HTTP server; Vitest for tests.

### Rationale
- Smallest surface, zero cold-start cost, fully offline, deterministic, and easiest to
  test — least moving parts on a judge machine.
- The architectural differentiator (deterministic engine + bounded AI) is independent of
  the UI framework; a reviewer who gets planner-not-chatbot won't care about the
  framework layer.
- For a no-key offline machine, minimizing install/build/run surface is the winning
  trade.

### Alternatives Rejected
- React + state layer (2): more deps to install/run, heavier on a judge machine, and
  Redux-style global state is overkill for a demo. The wow is not in the React-ness.
- Option 3: increases surface; the choice is a coin-flip, not an architectural
  differentiator, and risks N1/N2 simplicity.

### Consequences
- UI is lean; the demo's believable-product feel is delivered via the visible AI
  reasoning panel and decision receipt (ADR-014), not framework weight.

### Implementation Impact
- Package setup, build tooling, test runner, server, module boundaries, offline run
  path.

---

## ADR-012 — Database / Storage

### Status
Accepted

### Context
The demo must run offline on a judge machine, and there is no multi-user/save/login/AR/
e-commerce in scope (PRD non-goals). The MVP data is a static curated catalog plus
per-session state. The question is whether any database or persistence layer is
justified.

### Options Considered
1. No database; file-based — typed JSON/TS catalog files (per ADR-008) validated at
   load; session state held in memory; no persistence layer.
2. SQLite embedded database.
3. Hosted database / document store with an API layer.

### Decision
Option 1: no database for the MVP. Catalog = file-based (settled in ADR-008); session
state is in-memory; no persistence layer.

### Rationale
- Nothing in the MVP requires durable multi-user storage; a DB adds install/offline risk
  and scope against N1/N2.
- The data-architecture rigor that matters (schema, validation, quarantine,
  compatibility graph) is already delivered by the file-based approach in ADR-008.
- In-memory session state is sufficient for single-session planning and re-optimization.

### Alternatives Rejected
- SQLite (2): native dependency + migration overhead + judge-machine install friction
  for a static catalog and throwaway session state.
- Hosted DB (3): violates offline/no-key; no product need in MVP.

### Consequences
- The product is inherently single-session for the demo; persistence/multi-user is
  cleanly deferred (documented, not silently dropped).
- Any future persistence layer can be added behind the catalog/session interfaces
  without touching the engine.

### Implementation Impact
- Catalog load-path, in-memory session store, no persistence dependencies.

---
## ADR-013 — AI Model Usage & Offline Fallback

### Status
Accepted

### Context
PRD section-18 prescribes NVIDIA NIM hosted Kimi K3 (moonshotai/kimi-k3, multimodal,
text + image) as the primary model, with a rule-based local narration + cached
illustrative outputs degrading gracefully offline (PRD section-18, N1/N2). Grounded by
ADR-002 (bounded AI) and ADR-009 (photo = qualitative seed/narration only).

### Options Considered
1. Kimi K3 via NIM as default behind a thin, stable ai adapter module; offline fallback
   (deterministic template narration + cached illustrations) always present and able to
   shoulder the whole demo if network/keys are unavailable; model id/endpoint
   .env-switchable.
2. Model-agnostic multi-provider abstraction (NIM as one provider; local/Ollama or
   OpenAI as another).
3. Deterministic-only, drop the remote LLM.

### Decision
Option 1: Kimi K3/NIM default behind a thin stable interface; .env-switchable model
id/endpoint; always-on deterministic offline fallback that fully covers the demo path.

### Rationale
- Honors PRD section-18 exactly while guaranteeing offline/no-key operation (N1/N2).
- A single change-point provides all the swappability the demo needs without a heavy
  abstraction.
- Keeps the made-visibly-intelligent promise (ADR-002), which a deterministic-only build
  would forfeit.

### Alternatives Rejected
- Option 2: adapter over-engineering; there's essentially one real provider to
  integrate, and a local LLM adds install/GPU friction (N1/N2). The config change-point
  in Option 1 is sufficient.
- Option 3: forfeits the ADR-002 innovation credit.

### Consequences
- The AI experience is best-effort enhancement; correctness never depends on it.
- The demo runs identically with or without network/keys (fallback handles taste,
  narration, photo signals).

### Implementation Impact
- ai adapter interface, NIM client, offline template engine, .env config, degradation
  boundaries.

---

## ADR-014 — Explainability

### Status
Accepted

### Context
OPT Q10 / PRD section-18 prescribe a two-layer model: a deterministic decision receipt
(top-k plans, per-term scores, fired-rule trace, data-gaps) that AI rephrases. The open
question is how far the AI narration may go and what the receipt must contain so
narration can never invent facts.

### Options Considered
1. Strict factual narration only — AI receives only the JSON receipt and may
   rephrase/summarize/pick a friendly order, but may not add facts or cite a rule not in
   the trace.
2. Option 1 + a visible decision-receipt/comparison panel that the narration annotates
   (each AI claim grouped under the fact it explains).
3. Loose free-form AI explanation beyond the receipt.

### Decision
Option 2: receipt-traceable AI narration (every AI claim traces to a receipt field)
plus a visible decision-receipt/comparison panel the narration annotates.

### Rationale
- Turns determinism from an assertion into something demonstrated on screen — the
  strongest, auditable expression of AI-proposes-reasons-engine-decides.
- Provably honest; low hallucination surface; reinforces the planner-not-chatbot proof
  (N6).

### Alternatives Rejected
- Option 1: correct but the determinism is asserted rather than shown.
- Option 3: drifts toward the AI deciding, risks inventing reasons not in the trace,
  and could be caught by a reviewer — kills credibility. Rejected at the root.

### Consequences
- A receipt panel is a required UI investment (shared with ADR-002 reasoning panel).
- Narration is contractually bound to the receipt schema.

### Implementation Impact
- Decision-receipt data structure, receipt panel UI, narration prompt bound to receipt
  schema.

---

## ADR-015 — Infeasible-Solution Handling

### Status
Accepted

### Context
The demo's strongest story (PRD section-17) is the impossible brief (tiny room,
tub+shower+double vanity+toilet, meager budget) — do not crash — that-can't-all-fit,
here-are-3-ways. The spec prescribes hybrid relaxation with fail-cause tracing and a
hand-ordered menu (OPT Q9/Q11/Q14). The open decision is which relaxation axes to
commit to, how to guarantee 3 distinct ways, and what the honest failure wall is.

### Options Considered
1. Full hybrid protocol — fail-cause trace (fired-rule counts + min-gap -> binding
   constraint) drives a hand-ordered relaxation menu, each entry re-searched and
   independently re-validated: (1) swap-in-smaller-SKU, (2) shrink-clearance,
   (3) drop-a-class, (4) raise-budget, (5) move-door/window — producing 1-3 distinct
   provably-valid relaxed plans, each labeled with what changed and its new total/cost;
   honest out-of-scope if nothing yields. Never a hang, never an invalid plan.
2. Simplest graceful message — can't fit everything; here's the closest single valid
   plan.
3. User manually picks among the trade-offs; engine re-checks.

### Decision
Option 1: the full trace-driven relaxation protocol with fail-cause tracing, a
hand-ordered independently-validated menu, 1-3 distinct provably-valid plans, and an
honest out-of-scope wall.

### Rationale
- This is the demo spine and a large, demonstrable part of the 45% innovation credit.
- Compounds ADR-007 (fired-rule trace) and ADR-014 (receipt): relaxation decisions are
  traceable and narratable.
- Deterministic and safe: every relaxed plan passes the full validator; exhaustion
  routes to honest out-of-scope, never a hang or invalid output.

### Alternatives Rejected
- Option 2: safe floor but forfeits the 3-ways wow and the controller-driven story.
- Option 3: pushes the hard work back on the user, demands re-running invalid combos,
  and the demo should show intelligence, not demand work. Only an optional advanced
  toggle later.

### Consequences
- Requires genuinely correct fail-cause tracing (else it offers a wrong fix) — added
  engine, UI and test surface.
- The 3-ways route guarantees 3 distinct, valid, narrated relaxed plans (tied to
  ADR-017 tests).

### Implementation Impact
- Relaxation engine, fail-cause diagnostics, hand-ordered menu config, the 3-ways
  route, honest-out-of-scope path, tests.

---
## ADR-016 — Performance & Scalability

### Status
Accepted

### Context
Regenerate must be ~2s typical (PRD N3), offline/no-GPU/no-key (N1/N2). The spec
prescribes caching the candidate set per (archetype ∪ geometry ∪ constraint-state) and
targeted incremental re-optimization (OPT section-17, Q8). The open decisions are the
cache granularity + invalidation, incremental-vs-full re-optimization semantics, and
render caching.

### Options Considered
1. Coarse caching + bounded backtracking + incremental semantics — candidate search
   result cached per (geometry ∪ archetype ∪ feature-set) as weight-independent per-term
   components; the final weighted score computed on demand (so priority/knob changes are
   free re-scores); bounded backtracking as a hard ceiling; exhaustion -> relaxation
   (ADR-015). Renders (2D and 3D) also cached to make view toggling and re-render after
   a re-score fast.
2. Aggressive fine-grained caching — per subproblem/fixture memoization.
3. No caching — always full re-search.

### Decision
Option 1: coarse component-level caching with instant re-score, bounded backtracking,
and incremental re-optimization; 2D and 3D renders are cached so both views render
quickly and re-render fast after a re-score.

### Rationale
- Meets the ~2s bar by construction: the demo's dominant interactions (priority/
  spaciousness/re-score taps) are pure re-scores; full re-search only occurs on real
  geometry/feature change and stays bounded.
- Component-level caching keeps re-score-only correct because per-term utilities are
  weight-independent anchors (ADR-005).
- Caching rendered 2D/3D output makes the view toggle and post-edit re-render feel
  instant.

### Alternatives Rejected
- Fine-grained caching (2): complex invalidation and more staleness-bug surface; buys
  nothing at this scale.
- No caching (3): every priority/knob edit re-runs the whole search, making common demo
  interactions sluggish.

### Consequences
- Cache invalidation correctness on the right keys needs testing (ADR-017).
- The node ceiling means an extremely unresolved room caps out -> relaxation (by
  design).

### Implementation Impact
- Candidate-set cache, component/score caching, render caching (2D + 3D), incremental
  re-optimization paths, invalidation keys.

---

## ADR-017 — Testing Strategy

### Status
Accepted

### Context
The biggest credibility risk is shipping a planner demo and letting an invalid plan slip
through. The spec prescribes determinism/hash, hard-rule compliance, relaxation
correctness, objective/priority oracle, anchor stability, edge cases, repro/latency
(OPT section-18). The decision is the testing baseline that institutionalizes the
no-invalid-output guarantee.

### Options Considered
1. Full gate-enforced Vitest suite — (1) determinism hash(inputs)->hash(plan) across
   repeated + reordered inputs; (2) hard-rule compliance property-style over valid
   candidates AND injected/mutant invalid ones (must be rejected — proves the validator
   catches bad plans); (3) relaxation correctness (every relaxed result valid,
   minimal-sufficient, 3-ways = 3 distinct); (4) objective/priority oracle (each priority
   selects its expected best); (5) anchor stability; (6) edge cases (tiny room,
   missing-dims gate, quarantine, ties, ultra-low budget); (7) latency regression timer
   ~2s typical. Enforced as a pre-review gate.
2. Spot-check tests only — a few happy-path validations + one determinism check.
3. Heavy property-based fuzzing infra — randomized property suite over all inputs.

### Decision
Option 1: the full gate-enforced regime, including injected-invalid rejection,
determinism, relaxation/3-ways, priority oracle, anchors, edge cases and the ~2s
latency timer.

### Rationale
- Directly backs the number-1 differentiator: a validator untested against injected
  invalid plans is unproven.
- The gate makes no-invalid-output institutionalized rather than a hope — defensible on
  camera.
- Sized right for a curated 40-80 SKU + bounded search: hand-built + small-property
  coverage beats broad random fuzzing here.

### Alternatives Rejected
- Spot-checks (2): puts the core promise on fallible manual judgment — the
  reviewer-catastrophe risk.
- Heavy fuzzing (3): overkill and adds flakiness/slowness for a space this curated.

### Consequences
- Testing is the largest correctness investment after the engine itself; justified
  because it is the correctness promise.
- Determinism, latency, and relaxation tests jointly protect the demo-wow and
  reproducibility.

### Implementation Impact
- Test suite layout, injected-invalid (mutant) fixtures, determinism hash harness,
  latency regression timer, gate wiring.

---

## ADR-018 — Prototype vs Production Trade-offs

### Status
Accepted

### Context
Everything else favors a tight, reliable, deterministic, offline demo with bounded,
visible AI. The final decision is where to spend quality, where to take demo-grade
shortcuts, and how to strike a posture that reads product-credible rather than
hackathon-hack, under a 45% innovation rubric and hackathon time constraints.

### Options Considered
1. Product-credible on the demo-critical rails; demo-grade elsewhere — concentrate
   effort where the reviewer watches (impossible-brief wow, decision-receipt panel,
   2D/3D toggle, offline fallback, honest narration); deliberately defer/tone the rest
   (full catalog volume, exotic room shapes, auth/storage/multi-user, e-commerce);
   document shortcuts explicitly instead of silently dropping them.
2. Maximum production-grade everywhere.
3. Aggressively demo-optimized around one scripted demo.

### Decision
Option 1: harden the demo-critical rails and the deterministic core (the true
differentiator); keep surface area deliberately bounded to the MVP contract; make the
explicit scope decisions themselves part of the pitch.

### Rationale
- The differentiator (D2) demands robustness and re-rollability for any brief, not just
  the scripted one; the reliable, general core must carry that.
- Reading as curated-not-randomly-thin is fixed by documenting what's intentionally out
  — reads as seniority and aligns with the AGENTS.md scope-control discipline.
- 45% innovation credit is protected by investing where it's earned (wow, receipt,
  render toggle, offline fallback) without spreading thin.

### Alternatives Rejected
- Maximum production-grade (2): over-budget for a hackathon, risks the demo-crash
  scenario, and dilutes the differentiators with completeness effort.
- Demo-optimized-around-one-script (3): reads as a demo that can't do anything else —
  the anti-thesis of planner-not-chatbot, and fragile with judges who poke.

### Consequences
- Deliberately out-of-scope items are documented (README/TODO) so nothing is silently
  dropped.
- Effort allocation is explicit and defensible; robustness, not breadth, is the
  competitive posture.

### Implementation Impact
- Scope discipline across all packages, explicit deferred-work register, demo-script
  readiness, pitch framing.

---

## ADR-019 — Catalog Schema Concrete Decisions

### Status
Accepted

### Context
PRD §11, SYSTEM_ARCHITECTURE §5.3 and ADR-008/012 fix the catalog's field seed, storage model and
quarantine posture, but leave concrete semantics open that block implementation of the catalog
module: pair-level compatibility defaults (C7), how mounting is expressed, canonical units, water
metadata, and finish-priced BOMs. `docs/PRODUCT_CATALOG_SCHEMA.md` resolves them; the choices are
recorded here so they are auditable and changeable only by a new ADR.

### Decision
1. **Compatibility default rule:** `defaultOk(a,b) = whiteWare(a) ∨ whiteWare(b) ∨ families(a) ∩ families(b) ≠ ∅`,
   with precedence **veto > force > default**. Finish harmony of *chosen* finishes is a C7
   evaluator rule in `engine/rules`, not a graph property.
2. **Mounting** is expressed as exactly-one mandatory feature tag
   (`floor_mount | wall_mount | deck_mount | freestanding`), per the PRD seed — no duplicate field.
3. **Canonical units:** mm only (≤ 1 dp), INR integer prices; inches derived for display only.
4. **Water metadata** (`flowRateLpm` / `flushLiters`) is mandatory for faucet/shower/toilet,
   extending OPT §13.4's mandatory list so no objective term can score from a data gap.
5. **`priceByFinish`** optional per-finish price overrides; BOM line items carry `finish`.
6. `u_maintenance`'s simplicity component derives deterministically from primitive count +
   complexity tags; "brand-tier points" = config-weighted `luxuryPoints` + feature bonuses
   (no separate field).

### Rationale
- The default rule gives C7 real content deterministically (the real coordination constraint is
  among trim finishes; white-ware is neutral) while keeping the curated override graph
  authoritative per ADR-008.
- Tag-expressed mounting prevents field/tag drift against the PRD seed; single-unit storage
  protects geometry/hash determinism (SYS-ARCH §16 risk 2).
- Mandatory water data makes "no 0-gap SKU enters a scored candidate" (OPT §13.4) literally true
  for `u_water`.

### Alternatives Rejected
- All-pairs default-compatible with vetoes only: leaves `compatibility[]` force edges semantically empty.
- Separate mounting field: duplicates PRD seed tags; drift risk.
- Optional water data with worst-anchor fallback: scores silently degrade; weaker than the
  no-invalid-output posture.

### Consequences
- Catalog authoring is stricter than the OPT mandatory minimum (water fields); curators must
  supply flow/flush values.
- Vocabulary closures and the default rule are spec-amendment-gated (recorded here), protecting
  determinism.

### Implementation Impact
- `engine/catalog` `schema.ts` / `validate.ts` / `graph.ts` per
  `docs/PRODUCT_CATALOG_SCHEMA.md`; the C7 evaluator gains the finish-harmony sub-rule; engine
  config gains luxury/wear weight entries.

---

## ADR-020 — Two Explicit “3 Ways” Modes

### Status
Accepted

### Context
ADR-005 defines deterministic priority-profile alternatives for the richer “show me 3 ways”
experience. ADR-015 and the Optimization Specification define a different mandatory behavior for
an impossible brief: trace the blocker, relax a constraint, re-search, and independently validate
the resulting plans. These are different product situations and must not be collapsed into one
ambiguous solver or UI contract.

### Decision
The product exposes two explicit modes:

1. **Ordinary valid brief:** the primary result is selected by the requested priority. A separate
   alternative-profile route may present deterministic alternatives scored with distinct priority
   profiles. This remains stretch behavior unless the MVP schedule supports it.
2. **Impossible brief:** the mandatory MVP route is a relaxation menu. Each option changes a named
   constraint, is re-searched independently, passes the full validator, and is presented with its
   measured trade-off. The result may contain one to three distinct valid plans, or the honest
   out-of-scope state.

The two modes have separate typed outputs and user-facing labels. Neither mode permits AI to
choose feasibility, geometry, compatibility, budget, or placement.

### Rationale
- It preserves the accepted scalar objective and priority-profile decision in ADR-005.
- It preserves the trace-driven, validated impossible-brief behavior in ADR-015.
- It prevents a normal recommendation alternative from being mistaken for a feasible recovery
  from an impossible brief.
- It keeps the MVP implementable: relaxation is required; ordinary multi-profile alternatives can
  remain bounded stretch work.

### Consequences
- The solver and receipt contracts must distinguish alternative-profile results from relaxation
  results.
- UI copy and tests must prove which mode produced each alternative.
- The implementation roadmap treats this clarification as complete and routes it into T-010.

### Implementation Impact
- `engine/relax`, objective/profile configuration, `BuildOutput`/receipt types, result and
  relaxation views, and the corresponding validator tests.

---

## ADR-021 — Monorepo Scaffold Conventions

### Status
Accepted (appended by architecture-agent with the T-001 scaffold; ratified by the
orchestrator on review, 2026-09-13)

### Context
ADR-001/ADR-011 fixed the three-package monorepo and the toolchain, but not the concrete
scaffold choices: the module system per package, where shared dev tooling lives, the
documented local command names, the package naming scheme, and the Node/npm floor that
current Vite requires.

### Options Considered
1. ESM everywhere — NodeNext for engine+server (tsc emits; Node/library code), ESNext +
   Bundler + noEmit for web (Vite owns emission); typescript+vitest hoisted as root
   devDependencies; root scripts as the documented run path.
2. CommonJS server / dual ESM+CJS builds.
3. Per-package tool installs (each workspace pins its own typescript/vitest).

### Decision
Option 1. Every package is `"type": "module"`. engine+server use
module/moduleResolution `NodeNext` and emit via `tsc`; web uses `ESNext` + `Bundler` +
`noEmit` (Vite emits). typescript and vitest are root-only devDependencies shared by all
workspaces; vite is web-only; @types/node is server-only. Packages are named
`@kolher/{engine,web,server}`. Documented local commands are the root scripts:
`build`/`test`/`typecheck` run across workspaces (`--workspaces --if-present`,
topological order), `dev` prebuilds engine then starts Vite, `start` builds then runs
the server. Engines floor: node >=20.19, npm >=10 (current Vite requirement).
The engine tsconfig additionally sets `lib: ["ES2022"]` (no DOM) and `types: []`, so
DOM/Node ambient-type coupling fails at compile time.

### Rationale
- One module system removes dual-build complexity; NodeNext is the correct ESM mode for
  tsc-emitted Node/library code, Bundler matches how Vite actually resolves.
- A single hoisted compiler/test-runner version prevents toolchain drift inside the
  determinism-critical core (N4).
- Root scripts keep the offline story one command long (N1/N2: `npm install && npm start`).

### Alternatives Rejected
- CommonJS/dual builds (2): extra config and interop hazard for zero product value.
- Per-package tool pins (3): version-drift risk and install weight; the workspace root
  already provides the single shared install.

### Consequences
- engine/server source must use explicit `.js` extensions on relative imports (NodeNext).
- Web never emits via tsc; its typecheck is `tsc --noEmit` only.
- `package-lock.json` at the root is the reproducibility artifact and is not gitignored.
- Engine test files are excluded from the engine tsconfig so test artifacts never ship in
  `dist`; tests are exercised by Vitest, not type-checked by `tsc`.

### Implementation Impact
- Root `package.json`/`tsconfig.base.json`/`README.md`; per-package tsconfigs extending
  the base; `@kolher/*` workspace symlinking; the offline run path.

---

*End of DECISIONS.md v1.0. Historical decision log — append future ADRs rather than
rewriting prior ones.*

---

## ADR-022 — Shared Contract Location, Vocabulary Ownership & Type Purity

### Status
Accepted (appended by the orchestrator during T-002 after three delegated implementation
attempts failed on tooling limits; self-reviewed against SYS-ARCH §§5–8 and OPT §§2–3/14)

### Context
T-002 required one explicit cross-package contract (engine, web, server) plus a
deterministic config. The spec seeds left four things open: which module owns the closed
vocabularies the catalog will also need; the "balance"/"balanced" priority-name conflict
between OPT §2.4 and §6.1; how far engine type purity extends (SYS-ARCH §6.3's `AICli`
takes a `Blob`, a DOM type); and OPT §5's self-contradiction "all rule values live in a
single config file (one file per rule)".

### Options Considered
1. Contracts module owns vocabularies + all cross-package types; catalog imports them;
   `Config` type split from `DEFAULT_CONFIG` values; `KohlerEngine` declared type-only;
   canonical ordering/precision/hash-inputs made executable in contracts.
2. Catalog owns vocabularies; contracts depend on the catalog module.
3. Keep `InputSet.featureConstraints` as the §5.4 seed's `string[]`.
4. Eight per-rule config files.

### Decision
Option 1, concretely:
- `packages/engine/src/contracts/` is the single cross-package contract; closed
  vocabularies (`FixtureClass`, `FeatureTag`, `FinishFamily`, `MountingTag`, `Priority`,
  `Spaciousness`) live there; the future catalog module (T-003) imports and never
  redefines them.
- `Priority` spelling is `"balanced"` (OPT §6.1, the operative weight table) over §2.4's
  `"balance"`.
- `Config` type lives in `config/config-types.ts`; values (`DEFAULT_CONFIG`, `RULES`) in
  `config/config.ts` + `config/rules.ts` — one rules module with one named entry per rule
  C1–C8 satisfies both OPT §5 readings without eight near-empty files.
- Engine type purity: `KohlerEngine` (SYS-ARCH §6.1) is declared type-only; the `AICli`
  adapter (§6.3) and its `Blob` parameter are excluded from engine contracts — the AI
  adapter is server/adapter-side (T-013). `import type` is used on the plan↔receipt edge
  so the type-only cycle is erased at runtime.
- `canonicalJson` (deterministic stringify: sorted keys, numbers at 1-dp, throw on
  non-finite) lives in contracts — "define canonical ordering/precision/hash inputs" is
  executable here; digest functions land with T-003.
- Additions over the §5.4 seeds: `Candidate.id` + `Plan.id` (tie-breaks/receipts need
  identity), `Plan.bom` (OPT §3.2 makes the BOM a mandatory output needing a home),
  discriminated `BuildOutput.kind`, `InputSet.featureConstraints` concretized from
  `string[]` to the structured OPT §2.3 form, `Zone` as a wall-strip span.

### Rationale
- Vocabulary ownership in contracts keeps one source of truth without a contracts→catalog
  dependency cycle; the catalog stays the consumer.
- `"balanced"` removes the only spelling conflict; both spec sites describe the same knob.
- Splitting Config type from values lets contracts import shapes without coupling to the
  growing value module.
- Excluding `Blob`/DOM from engine contracts keeps the compile-time purity guard
  (`lib: ["ES2022"]`, `types: []`) meaningful for every future engine module.

### Alternatives Rejected
- Catalog-owned vocabularies (2): introduces contracts→catalog dependency; the catalog is
  T-003 scope and must import, not own, shared types.
- Seed-faithful `string[]` feature constraints (3): unstructured strings cannot drive
  deterministic feature-constraint matching (C7) or closed-vocabulary validation.
- Eight per-rule files (4): ceremony with no reviewability gain over one named entry per
  rule in a single module.

### Consequences
- T-003 must import vocabularies from `@kolher/engine` contracts and narrow
  `HashInputs.catalogState` (typed `unknown` until CatalogState exists).
- Numeric rule values not present in the specs were seeded as planning-level defaults
  marked `pending product audit`; the product-agent must audit them (tracked in TODO).
- Contract additions listed above are additive to SYS-ARCH §5 and require spec-echo
  updates nowhere (SYS-ARCH §5 is a mirror, not the authority).

### Implementation Impact
- `packages/engine/src/contracts/**` (10 modules), `packages/engine/src/config/**`,
  engine entry re-exports (`ENGINE_CONTRACT_VERSION` 0.0.0 → 0.1.0), type-only contract
  imports in web/server, `contracts/canonical.test.ts` invariants.

---

## ADR-023 — Catalog Load-Time Bounding-Box Check Window

### Status
Accepted

### Context
SCHEMA §6.3 requires that the union of primitive AABBs be contained in the SKU `dim`
bounding box with ±10 mm tolerance. The worked examples (§13.1/§13.3) mix two offset
conventions: toilet parts use an edge-origin z axis (tank at z=0 spanning d=185) while the
deck-mounted faucet's centered body uses negative x offsets (radius overhang). A literal
`[0, span] + tol` window per axis would quarantine the §13.3-style records.

### Decision
The load-time bbox check accepts, per axis (x, y, z), a primitive-extent window of
`[−span/2 − 10, span + 10]` mm measured from the anchor origin. This covers both
authored conventions (edge-origin and centered) while still bounding gross geometry
errors (mis-sized or wildly offset primitives). Gross violations still quarantine with
`GEOMETRY_BBOX_MISMATCH`. Any change to the offset convention at curation (T-004) must
revisit this window.

### Rationale
- Deterministic and convention-tolerant without weakening the guarantee that renders
  and footprints describe the same object.
- Alternative (strict `[0, span]`) would force §13.3-style deck anchors to use half-span
  x offsets, contradicting the spec's own valid example.

### Consequences
- `packages/engine/src/catalog/validate.ts` implements the window; quarantine-matrix
  test `GEOMETRY_BBOX_MISMATCH` asserts the gross-violation path.
- If T-004 curation normalizes on a single convention, the window can be tightened and
  this ADR amended.



---

## ADR-024 — Geometry rule models for C2–C6 (T-006)

Date: 2026-09-14
Status: Accepted

### Context
OPT §5 names rules C2–C6 in one line each; the concrete measurement models are not
specified. C1 (T-006, pre-existing) and the C1–C6 shared helpers (corridor measurement,
placement resolution) set the deterministic pattern: axis-aligned AABBs, EPSILON_MM
touch-tolerance, canonical ordering, measured deltas even when passing, all values from
`config.rules.*` (ADR-022).

### Decision
- **C2 clearances**: front = unobstructed corridor (clearDistanceMm) from the fixture's
  front face inward, laterally bounded by the footprint's along-wall span; side = along
  the wall in both directions from the side edges, laterally bounded by the inward depth.
  Blockers are other fixture AABBs + `rep.obstacles`; behind-blockers pre-filtered.
- **C3 door swings**: an opening's swing sweeps a quarter disc of radius
  `leafDimsMm.w` hinged at the opening's START point on its strip (the contract does not
  carry a hinge end; start is the deterministic choice), inward or outward per
  `swing.side`. Evaluated via the sector's CONSERVATIVE AABB — a blocker clipping the
  bounding box but not the disc counts as colliding. Margin from
  `C3_CONFIG.collisionMarginMm`; in-swing sectors must stay inside the polygon.
- **C4 zones**: a binding passes when some declared Zone of an accepted kind (Fixture.
  zones) on the SAME strip contains the placement span (touch within EPSILON_MM ok).
  Zone-requiring fixture with no matching zone fails (`c4-no-zone`); zone-free classes
  (faucet/accessory) are skipped.
- **C5 plumbing minima**: rough-in point = CENTER OF THE BACK FACE (flush edge on the
  strip) — rough-ins are not catalog data in the MVP. Rough-in-bearing classes: toilet,
  basin, shower, tub. Checks: same-strip pairwise separation, rough-in vs door/window
  spans, and (only where matching zones exist) rough-in-to-zone-center reach.
- **C6 layout sanity**: (a) door swing must not intersect any fixture's front-clearance
  corridor (reuse of the C2 model at the configured reach); (b) fixture must not overlap
  a DOOR span (windows excluded — a vanity under a window is legal).
- **Composite**: `evaluateGeometryRules()` returns the full C1–C6 verdict trace in
  canonical order, no short-circuiting, for receipt tracing (PRD §10.4).

### Rationale
- Every model is exact for axis-aligned geometry (no sampling), deterministic, and
  derived from data the contracts already carry; where data is missing (hinge end,
  rough-in points) the most conservative deterministic assumption is documented here
  rather than silently invented.
- Conservative swing AABBs keep C3/C6 cheap and safe; precision loss only ever rejects,
  never accepts, a marginal swing.

### Consequences
- `packages/engine/src/geometry/rules/{c1_fit,c2_clearance,c3_swing,c4_zones,c5_plumbing,
  c6_sanity,index}.ts`; tests in `rules.test.ts` (29 tests) assert pass/fail/EPSILON
  boundaries, config-driven values, L-shape cases, and trace order.
- C1 bug fixed during T-006 review: `minPairGapMm` was initialized to 0, so a positive
  min gap could never be measured ("deltas measured even when passing" was violated).
- If real hinge-side or rough-in catalog data lands, C3/C5 should consume it and this
  ADR amended; C7/C8 (T-007/T-009) are separate evaluators outside the geometry layer.

## ADR-025 — C7 feature-constraint semantics (T-007)

### Context
OPT §5's C7 row says "SKUs must match the feature-constraint set" without fixing whether a
required tag (e.g. `smart`) must be carried by every bound SKU or by at least one (the
candidate-level reading). `InputSet.featureConstraints` carries required tags only; forbidden
tags are a relaxation lever with no InputSet source.

### Decision
- **Required tags: candidate-level coverage** — at least one bound fixture carries the tag
  (a smart toilet + chrome faucet jointly satisfies `smart`).
- **Forbidden tags: per-SKU** — no bound fixture may carry a forbidden tag.
- Forbidden tags enter C7 via a typed `C7FeatureSet` engine input (`c7_compat.ts`), mapped
  from `InputSet.featureConstraints` by `c7FeatureSet()` with an empty forbidden list; not
  added to the InputSet contract.
- Mounting per ADR-019: exactly-one mounting tag verified deterministically in C7; `wall_mount`
  requires a carrier wall recorded as a measured delta + config note — C7 is never the
  wall-construction authority.
- Quarantined/dangling/self-referenced SKUs cannot enter the graph or a candidate — enforced
  at load (T-003 `buildCatalog`); C7 additionally fails unknown ids (`c7-sku-not-in-graph`).

### Consequences
- `packages/engine/src/rules/c7_compat.ts` + 13 tests; C7_CONFIG explanation extended.
- If product wants per-SKU required matching, it is a one-line change to the required-tag loop;
  amend this ADR first.

### Verification (T-007 acceptance)
- 142/142 engine tests pass (incl. override-precedence veto>force>default, finish harmony,

---

## ADR-026 — Deterministic Finish Resolution and the u_luxury/u_maintenance Point Scales (T-009)

### Status
Accepted

### Context
T-009 requires finish-aware BOM pricing (`priceByFinish`, SCHEMA §5; line items carry
`finish`), but T-008 candidates carry no finish selection — `assembleCandidate` cost SKUs
at base price. The BOM, C8 verdict, and u_cost therefore could not see the TRUE cost
until finishes were resolved. Separately, OPT §6/§7 name the luxury/maintenance inputs
(finish family, smart features, simplicity) but not concrete per-fixture arithmetic.

### Decision
1. **Finish resolution happens after candidate validation, before scoring** (new
   `engine/objective/finish.ts`), deterministically:
   - Eligibility per SKU: finish options whose SCHEMA §4 family is in
     `featureConstraints.finishFamilies`; empty constraint → all options eligible.
     A SKU with no eligible option makes the candidate finish-inconsistent (dropped).
   - Harmony: under an active family constraint, the lexicographically first family
     shared by every SKU's eligible set is applied where supported; others keep their
     cheapest eligible finish. Harmony never forces an absent option.
   - Within a pool: cheapest eligible finish wins; ties break on lexicographic finish id.
   - Resolved price = `priceByFinish[finish] ?? price`; resolved cost replaces the
     solver's base-price sum; candidates whose resolved cost exceeds B_max are dropped
     (C8 is then measured on the true cost).
2. **u_luxury** per fixture: integer points = 20 × finish `luxuryPoints` (1–3) +
   10 × premium-feature-tag count (capped at 4), capped at `ANCHORS.luxuryMaxPoints.value`;
   set score = mean per-fixture points ÷ anchor.
3. **u_maintenance** per fixture: integer points = 10 × finish `wearResistance` (1–5) +
   simplicity bonus max(0, 50 − 10 × complexity-tag count, capped at 5), capped at the
   anchor; set score = mean ÷ anchor.
   The 20/10/50 coefficients are engine point-scale constants; the anchors remain the
   normalization denominators and the flagged-for-audit config entries.
4. Undefined priority/spaciousness resolve deterministically to config defaults
   ("balanced"/"balanced"); the ADR-006 spaciousness modifier applies ONLY to the
   u_space weight, bounded, then the row is re-normalized to sum 1.

### Rationale
Keeping finish selection in the objective layer (not the solver) avoids re-opening the
T-008 search space: the solver's cost pruning stays a conservative lower bound, and the
C8 evaluator finally sees the real money. Anchored (not within-set) normalization keeps
scores comparable across briefs and candidate-set sizes (OPT §7/§18.5).

### Alternatives Rejected
- Pushing finish choice into SKU binding (T-008): multiplies the search space by the
  finish fan-out for no validity benefit; contradicts the T-008 scope split.
- Within-set min/max normalization for luxury/maintenance: scores would drift with
  candidate-set size, breaking OPT §18.5 anchor stability.

### Consequences
- BOM, budgetSummary and C8 are all measured on the resolved (true) cost.
- T-011 re-scoring must cache resolved finishes alongside candidates (weight-only
  changes reuse them unchanged).
- Flagged for product audit: the 20/10/50 point coefficients and the eco-gold anchors.

### Implementation Impact
- `engine/objective/{finish,scores,rank,c8,build-plan,solve}.ts` (T-009); verified by
  `objective.test.ts` (14 tests) within the 164-test engine suite.

  feature match, mounting, substitute closure symmetry/sort, quarantine gate); `tsc --noEmit`
  clean; full trace, no short-circuit; values sourced from C7_CONFIG.


---
## ADR-027 — Relaxation Protocol and “3 Ways” Implementation Contract (T-010)

### Status
Accepted

### Context
ADR-020 fixes the two “3 ways” modes; ADR-005 fixes the deterministic priority-profile
alternative route; ADR-015/OPT §10.2 fix the trace-driven impossible-brief route. The
SYS-ARCH §6.1 engine seed declares `relax(input, blockers: ValidationResult)`, but the
actual producer of failure facts is the T-008 typed solver infeasibility
(`reason + blockers: string[]`), and the engine needs `CatalogState` to measure
deficits. The concrete contract had to be reconciled with the seed.

### Decision
1. **solve() integrates mode 2 directly.** On a typed infeasible result, solve() runs
   fail-cause diagnosis → hand-ordered relaxation paths → 1–3 distinct fully validated
   plans (`BuildOutput kind: "relaxation"`), else the honest out-of-scope wall.
   `gate-blocked` and `invalid-input` failures bypass the menu (input repair, not
   constraint relaxation).
2. **relax() signature concretization.** The public entry is
   `buildRelaxationMenu(input, catalog, diagnosis, trySolve)` with diagnosis from
   `diagnoseFailures(input, catalog, reason, blockers)` — the typed solver infeasibility
   replaces the §6.1 `ValidationResult` seed, and `catalog` is an explicit parameter
   (deficits and min-viable cost must be measured). Record as the operative contract.
3. **Path set and order (OPT §10.2.2, least disruptive first):** swap-sku →
   shrink-clearance → drop-class → raise-budget → move-door. Policies:
   - swap-sku = release the taste finish-family constraint. Rationale: substitutes and
     compat-graph members are already inside every binding pool (same-class survivors),
     so the family filter is the only real deterministic pool-widening lever.
   - shrink-clearance = C2 values → `minLegal` floor (config-scoped clone, never below).
   - drop-class = the most expensive taste-required class (cheapest-SKU price desc,
     closed-vocab tie-break) forced to `{min:0,max:0}`.
   - raise-budget = B_max → minViableCost (the measured deficit; OPT §10.2.2d).
   - move-door = deterministic mirror of each door to the opposite end of its FULL wall
     edge; re-validation keeps any useless move out of the menu.
4. **Menu discipline:** each path re-searches through the full solve pipeline
   (`solvePlan`), so full-validator-on-every-output holds by construction; dedupe by
   plan id; bound `MAX_RELAXATION_PLANS = 3`; menu order = hand order.
5. **Mode 1 is a separate typed route, never BuildOutput:**
   `alternativeProfiles(input, catalog): AlternativeProfilePlan[]` re-scores the SAME
   validated candidate set per non-primary priority profile (ADR-005 argmax semantics).
6. **Behavior change (supersedes the T-009 direct out-of-scope for ultra-low budgets):**
   an impossible brief whose fix is a budget raise now yields a raise-budget menu;
   out-of-scope is reserved for exhausted relaxation (OPT §10.2.4).

### Consequences
- Objective module refactored: `validatedCandidates`/`solvePlan` extracted from
  solve(); `objective/solve.ts ↔ relax/relax.ts` form a function-declaration-only ESM
  cycle (safe under hoisting; no top-level execution).
- Demo richness note: probed fixtures yield 1-plan menus (single-lever failures); the
  OPT §10.2.5 “3 distinct plans” demo guarantee depends on the brief — T-021 rehearsal
  should select a brief maximizing menu breadth (tracked in TODO.md).
- T-011 must cache resolved finishes alongside candidates (ADR-026 consequence) and
  treat relaxation paths as full re-searches (no partial-cache reuse) initially.

---

## ADR-028 — Candidate-Set Cache Keys, Weight-Only Re-Score, and Local-Edit Full-Re-Search Fallback (T-011)

### Status
Accepted

### Context
T-011 implements ADR-016's coarse component-level caching and OPT §10.1's
`reoptimize` classification. The open concrete decisions: the exact cache key,
what is cached, and what a "local" edit does given the whole-bathroom candidate
shape (candidates are complete SKU-set+placement bundles, so OPT §11.1.2's
"replace affected strip" has no clean seam without solver surgery).

### Decision
1. **Cache key** = `sha256(canonicalJson)` over {polygon, openings (id-sorted per
   CANONICAL_ENTITY_ORDER), confirmed, featureConstraints, budget, config}.
   `priority`/`spaciousness` are EXCLUDED — they are weight-only knobs (ADR-005/006)
   that never affect candidate generation or validation, so a priority/spaciousness
   tap hits the same entry and re-scores. Config is included conservatively:
   extra misses are cheap, staleness is never acceptable.
2. **Cached payload** = the full `ValidatedCandidates` (candidates AND resolved
   finishes together — the ADR-026 consequence from the T-009 handoff), so a
   re-score never re-resolves finishes.
3. **Weight-only change** (`ReoptChange.kind === "weights"`) → pure re-score of the
   cached set (per-term utilities are weight-independent anchors); the argmax plan
   is assembled through `buildPlan`, which re-measures C1–C8 — nothing is trusted
   from the previous plan. If no validated set exists, the call falls through to
   `solve()` so the relaxation protocol / honest wall owns the reporting.
4. **Local change** → cache invalidation + bounded full re-search (documented
   deviation from OPT §11.1.2 strip replacement): the bounded constructive solver
   already lands ~350 ms typical, well inside PRD N3's ~2 s, and a full re-search
   is correct-by-construction. Strip-replacement remains a TODO-class optimization.
5. **Global change** → `solve()` unchanged.
6. The cache is a process-level bounded Map (32 entries, insertion-order eviction);
   only "ok" sets are cached (infeasible/gate-blocked re-routes stay honest).

### Consequences
- Priority/spaciousness changes re-score in milliseconds without stale geometry;
  geometry/constraint/budget/config changes miss and recompute (tested).
- Re-score equivalence is testable: `reoptimize(weights)` is JSON-identical to a
  fresh `solve()` under the new priority (test enforced).
- `solvePlan` now flows through the cache, so a fresh solve warms it and T-017's
  adjustment flow gets instant re-scores for free.


## ADR-029 — Automatic AI Décor on the Result Page; Split NIM Budget; Vision Photo Openings (T-025)

### Status
Accepted (2026-09-18).

### Context
The T-024 concept draft was an opt-in panel on the Taste screen that invented placeholder fixtures and
decor at AI-chosen coordinates. The configured NIM model (`moonshotai/kimi-k3`) never answered, so
every proposal request timed out after 25 s and the UI reported "AI service unavailable". The user wants
décor (lights, mirrors, plants, …) generated automatically from taste into the main Result 3D render,
with a visible working cue, and must stay under the NVIDIA NIM free-tier limit of 40 requests/min.

### Decision
1. Remove the T-024 concept draft (UI, state, `concept-draft` route, placeholder fixtures).
2. The AI returns a `DecorProposal` — closed-enum item types, anchors, sizes and a style (palette,
   metal, light temperature) with no coordinates. `placeDecor` (engine, deterministic) positions items
   against the solver's render geometry, never overlapping fixtures, front clearances or opening
   keep-clear zones; items with no legal spot are skipped. Caps: 14 items, 3 emitting lights.
3. Décor is presentation only: not a KOHLER product, not in the BOM or receipt; the UI says so.
4. A deterministic taste-keyword `offlineDecorProposal` is used when NIM is unavailable, slow (>12 s
   client budget), rate-limited or returns invalid output.
5. The server limiter is split into two independent 60 s windows: décor 10/min, all other NIM calls
   25/min (35 total < 40). No retries. Successful décor responses are cached server-side (LRU) and
   client-side by plan fixture set + taste text.
6. Models (supersedes the PRD §18 / earlier-ADR Kimi K3 choice, which no longer responds on the free tier): text `nvidia/nemotron-3-super-120b-a12b` (also the code default); photos `NIM_VISION_MODEL`
   (`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`). Default NIM timeout 10 s.
7. Photos produce opening-only `RoomProposal`s that enter the existing Review → Apply flow (ADR-009:
   never authoritative, never auto-applied).

### Consequences
- AI cannot place geometry; décor collisions are impossible by construction and testable.
- Décor always appears (AI or offline) and always reflects taste.
- Narration/tradeoffs can no longer starve décor of rate budget, and vice versa.
- Fixed plumbing detection from photos is deferred (TODO).

Implementation notes (T-025c): décor lights are PointLights with decay 0 and a 2600 mm cutoff (scene units are mm, so inverse-square falloff made them invisible); an AI pendant replaces the default ceiling lamp; the client caches only AI (non-fallback) décor per plan fixture set + taste; NIM requests send `chat_template_kwargs.enable_thinking=false` (Nemotron reasoning otherwise took ~13 s and could exhaust max_tokens); near-miss metal words (gold, silver…) are mapped to the closed enum before strict parsing.

## ADR-030 — Detailed 3D Room Render: Detail Meshes Inside Catalog Boxes, Bundled CC0 Assets (T-026)

### Status
Accepted (2026-09-18).

### Context
The Result 3D view drew every fixture as its raw catalog primitive (boxes/cylinders), with flat walls and
full-height gaps for windows. The user asked for Planner 5D–level detail (shaped tub/toilet/basins, wood
vanity, faucets, framed windows with muntins, baseboards, marble floor, real plants, eye-level views)
without weakening the "render = catalog geometry" and offline (PRD N1) guarantees.

### Decision
1. Each catalog primitive keeps its box as the authority; a procedural detail mesh (`render3d/detail.ts`)
   is built inside that box and is uniformly clamped back into it if a curve overshoots. Parts with no
   detailer, and all room parts, keep the primitive. A test checks every catalog SKU's primitives.
2. Variants come from the catalog product name (e.g. "freestanding" tub, "wall-hung" toilet,
   "mirrored cabinet"), never from AI output.
3. Materials: procedural white-marble floor and painted-wall textures (deterministic PRNG); bundled CC0
   Poly Haven wood textures and two plant models under `packages/web/public` (1.2 MB total, provenance in
   `public/ASSETS.md`). Any asset that fails to load leaves the flat-colour / procedural fallback.
4. Architecture from the SceneSpec: wall infill below window sills (900 mm) and above heads (2100 mm),
   window casing/muntins/glass/sill, door casing and a leaf standing open inside the swing zone,
   baseboards on interior faces. A generated `RoomEnvironment` map supplies reflections.
5. Overview uses a cutaway (walls, their trim and wall décor hide when the camera is behind them);
   a "View" select adds eye-level presets, one per wall that carries non-accessory fixtures.
6. Wall colour follows the AI décor palette (pulled toward a warm greige); wood tone follows the catalog
   finish lightness (dark = walnut, light = oak).

### Consequences
- Visuals improve without changing any engine output, BOM, or validation.
- The static server now allowlists `.glb` (`model/gltf-binary`).
- Standalone `basin` SKUs render at floor level because their catalog descriptor offsets start at y = 0;
  fixing that is an engine/catalog decision (TODO), not a renderer workaround. (Resolved by ADR-031.)

## ADR-031 — Engine mounting heights and curated style presets (T-027)

**Date:** 2026-09-18
**Status:** Accepted

### Context
Catalog primitives start at y = 0, so standalone basins, faucets, shower heads and accessories rendered
on the floor. Separately, aesthetics were only loose taste keywords, so rooms looked alike across tastes.

### Decision
1. The engine owns installation height: `mountElevationMm(sku)` (render/mounting.ts) with standard
   residential heights (counter 850 mm). The renderer adds it to catalog y; no rule, clearance or BOM
   reads it. Vessel vs undercounter comes from the catalog name, wall-hung from the `wall_mount` tag.
2. Standalone deck basins and faucets get a presentation-only counter slab (with an oval cut-out for
   undercounter bowls), captioned "shown for context, not included". Never a product, never in the BOM.
3. Eight curated presets in `engine/src/styles.ts` bundle palette, metal, light temperature, a floor and
   wall material (closed enums), a preferred finish family and a décor list. `DecorStyle.preset` is an
   optional closed enum in the strict décor parser; the AI may name one, offline keyword detection may
   set one, and a style card sets one explicitly.
4. A chosen style card is deterministic: décor comes from the preset without a NIM call (40 RPM budget);
   its finish family is applied through the existing finish chip, so the engine still validates it.
5. Materials and décor models are bundled CC0 Poly Haven assets (11 surface textures, 28 GLBs; ~10 MB
   total, each plant ≤ 1.2 MB), quantized + WebP. Three potted plants are composed offline from a pot model
   and a single plant variant. Missing/failed assets keep the flat-colour or procedural fallback.

### Consequences
- Surface décor is never placed "on" a standalone basin (its AABB is the bowl); it falls back to the floor.
- Deck faucets still sit wherever the solver placed them (TODO: co-locate with the basin).
- Adding a style = one `STYLES` entry plus optional model/texture mappings.

## ADR-032 — Deck faucets mount on their basin; basin × faucet fit; style product-type preferences (T-028)

**Date:** 2026-09-18
**Status:** Accepted

### Context
The solver placed a deck faucet as an independent wall fixture (own wall slot, often on another wall
than the basin). Every style preset produced the same toilet and basin because presets only changed
the finish family and SKU pools are cost-ordered. A vessel basin could also be paired with a standard-height
deck faucet, which is not a buildable installation.

### Decision
1. **Faucet placement (solver).** Faucets never take a wall slot. The k-th faucet is bound to the k-th
   placed basin: same wall strip, centred along the basin, flush to the wall (inside the basin AABB).
   No host basin, or a faucet larger than its basin, fails placement with a typed blocker.
2. **C1.** A faucet whose AABB lies fully inside a basin on the same wall is deck-mounted — one installed
   unit — and is exempt from the pairwise overlap check with that basin. All other overlaps still fail.
3. **Basin × faucet fit (catalog default rule).** `catalog/traits.ts` derives a product form from the
   authored name/tags (vessel / undercounter / wall-hung basin; tall / widespread / single faucet; wall-hung /
   one-piece / two-piece toilet; freestanding / alcove / drop-in tub). The §7.2 default compatibility rule
   pairs vessel basins only with tall faucets and all other basins only with standard faucets. Vetoes and
   forced pairs keep their precedence.
4. **Style → products.** `FeatureConstraints.preferredTypes` (optional, per class) narrows that class's
   binding pool to the preferred form when the catalog has one. Each preset in `styles.ts` declares
   `products`; the web app sends them when a style card is chosen. It is a preference, not a constraint:
   while the solve is infeasible, preferences are dropped one class at a time (tub → toilet → faucet →
   basin → …) and the solve re-runs, so a style never makes a feasible brief fail. All rules (C1–C8)
   still validate every output.
5. **Render.** A basin with a mounted faucet keeps a back deck (bowl shifted forward inside its box; the
   undercounter slab cut-out follows); faucets no longer get their own counter slab.

### Consequences
- Preset product forms are planning-level choices pending product audit.
- The plan does not yet tell the user when a style preference was dropped by the fallback.
- `u_space` still counts the faucet footprint even though it no longer uses floor/wall length.
- Product forms are parsed from names until the catalog has a dedicated form field.

## ADR-033 — Luxury editorial visual system for the web app (T-031)

**Date:** 2026-09-19
**Status:** Accepted

### Context
The web UI read as a generic SaaS tool (forest-green accent, rounded pills, check icons everywhere, Avenir
system font that renders differently per machine). The demo needs to feel premium and professional for a
bathroom-fixture brand without changing product behaviour.

### Decision
1. **Palette.** Ivory background `#F6F3EE`, near-black ink `#1C1B19`, charcoal primary buttons. Brass
   `#7A5F30` is a detail accent only (eyebrow labels, h1 rule, active step, total price). Muted green
   `#3F6B4F` is reserved for confirmed/validated states. Token names `--accent*` were kept so existing rules
   inherit the change.
2. **Type.** Cormorant Garamond 500 for h1/h2 and numerals (lining figures); Inter Variable for all UI text,
   with tabular figures for prices. Both bundled locally through `@fontsource` so an offline demo renders
   identically.
3. **Shape and motion.** 2 px radii on controls, 4 px on panels, hairline borders, soft large-blur shadows.
   200 ms colour/border transitions only; no hover lift; no screen fade-in because the app re-renders
   whole screens via `innerHTML`, which would replay the animation on every state change.
4. **Brand.** Text wordmark only ("KOHLER" in tracked caps + serif italic "AI Bathroom Designer"); no logo
   mark or official brand assets.

### Consequences
- 3D scene materials and style presets are unaffected; only chrome and the 2D/room preview SVG changed.
- Contrast pass (same day): values above were darkened after user feedback that the UI looked faded — ink `#141311`, muted `#4F4A43`, brass `#6B5127`, green `#2F5A3F`, bg `#F2EEE7`, panels `#FDFCF9`, serif weight 600. `styles.css` tokens are the source of truth.
- Colour pass (same day, user choice "Spruce + brass"): deep spruce `#1F4E4A` replaces charcoal as the primary/selected colour (`--accent*`); sand `#F1E6D3` and sage `#E3EBE4` tint canvases, notes and the trade-off panel; the result KPI and export band are spruce with light brass `#D9B979`; text brass is `#7A5C25`. The Taste-page "Brief status" panel was removed (room summary is still one click away via "Edit room").
- Spruce pass (same day): topbar is spruce with an ivory wordmark; headings, legends, links, secondary buttons and completed steps use spruce; panel headers sit on a sage band.
- Font files add ~20 small woff/woff2 assets to the build; browsers fetch only the latin subsets needed.


## ADR-034 — Steering knobs must move the plan; every plan is a complete bathroom (T-032, T-034, T-035)

### Context
User report: re-optimize "does nothing", products look the same for every aesthetic and priority, and the
budget "feels made up". Measured on the default brief (2400 × 1800 room, ₹1.8L target): the solver produced
only 8 distinct SKU sets (cheapest basin + cheapest toilet fixed, only the faucet varied), every priority,
spaciousness value and budget returned the same ₹33,100 toilet + basin + faucet plan, and standalone deck
basins rendered on a bare slab that looked like it floated.

Causes: binding pools are cheapest-first and capped at 64 sets; the shared 10,000-node budget was spent on up
to 512 placement variants of those first sets; the `compact-guest` archetype (no shower) was tried first and
won on spare floor; `u_cost` scored everything at or under target as 1.0, so the budget acted only as a
ceiling.

### Decision
1. **Shower required.** `compact-guest` is now a `fallback` archetype, skipped by default. The only way to
   reach it is the labeled `drop-class` relaxation "shower removed — no shower layout fits this room and
   budget".
2. **One sink, vanity by default.** Every count vector needs ≥1 sink (basin or vanity) and exactly one
   faucet per sink. With no style basin preference and no taste count on basin/vanity, the solve first tries
   vanity-only (the catalog vanity is cabinet + top + integrated basin, so it replaces the basin rather than
   joining it). A style with a basin preference first tries basin-only. Either way it falls back to the
   unconstrained set when infeasible. Deck faucets mount on a vanity like on a basin (placement, C1 deck
   exemption); vanity × faucet uses the basin rule (standard, not tall).
3. **Themed seed sets.** Before the cheapest-first enumeration, `bindSkus` emits one greedy set per
   objective axis: closest to B_target, premium within B_max, luxury, water, footprint, wear resistance.
   These sets don't depend on the weights, so the candidate cache key stays valid.
4. **Placement caps.** The solver checks at most 48 placements per SKU set and keeps 3 valid layouts per set,
   so the node budget reaches many sets. Measured: 8 → 34 distinct sets on the default brief.
5. **Cost curve.** `config.costCurve` sets `u_cost` at zero spend and at B_target per priority; it is linear
   in between and falls linearly to 0 at B_max. Balanced/luxury go 0.5 → 1.0, so leaving budget unused
   costs score. Value goes 1.0 → 0.7 (savings rewarded). Eco is flat at 1.0.
6. **Measured raise-budget.** With a mandatory shower the per-class cheapest set often has no valid layout,
   so `budgetDeficitInr` is now measured from the cheapest validated candidate. `minViableCost` remains the
   estimate for the out-of-scope wall; it now skips fallback archetypes, ignores optional classes and adds
   the mandatory sink.
7. **Render (presentation only, never in the BOM).** Undercounter/vessel basins stand on an open-topped
   cabinet under the counter slab. Wall-mount basins get a bottle trap and a waste pipe into the wall. A
   faucet on a vanity is lifted onto the vanity top. Custom-taste lights (no preset) are chosen by the
   décor metal. The caption reads "Décor and lights … not in the budget or BOM".
8. **BOM names.** BOM rows and the CSV show the catalog product name next to the model id.

### Consequences
- Default brief now (balanced spaciousness): value/eco ₹77,300; balanced/luxury ₹1,80,000; ₹60k brief ₹71,670; ₹5L brief ₹5,64,300.
  Presets differ across priorities (for example Classic Luxury: ₹75,000 value vs ₹1,47,300 luxury).
- **Spaciousness = product size (user decision, option b).** Spare floor varies only ~0.85–0.87 between
  candidate sets, so on its own even a ×2.5 space weight changed nothing. For airy/compact, `u_space` is now
  the mean of spare floor and a size fit: each floor fixture's footprint is ranked between the catalog's
  smallest and largest product of its class (catalog-anchored, independent of candidate-set size). Airy
  rewards small products, compact rewards roomy ones, balanced keeps spare floor only. This departs from
  OPT §6.1's plain spare-floor term. A "roomiest products" seed axis (capped at B_target) gives compact real
  options. It is a weights-only change, so the candidate cache stays valid and the store's re-optimize
  classification ("weights") is unchanged.
  Measured on the default brief: balanced priority, compact → Jute 36" vanity + one-piece WC (₹1,71,500);
  airy/balanced → 24" vanity + wall-hung WC. Tight budgets (₹60k) leave one affordable set, so all three
  match there.
- Relaxation tests updated to the measured raise target (≥ the estimate). The synthetic exhaustion catalog
  now includes a shower.

## ADR-035 — Wanted-fixtures list, shower-or-tub rule, windows anywhere, 10 MB photos (T-036, T-037, T-038)

### Decision
1. **One wanted-fixtures list** (`TasteState.fixtures`) is shown on the Taste page and in the Result adjust
   panel, where it replaces the single "Fixture mix" select. The toilet is locked on. Shower, tub and
   accessories are checkboxes: checked = `{min:1,max:1}`, unchecked = `{min:0,max:0}`. The engine does
   exactly what the list says. Sink is a radio: Auto (the ADR-034 vanity-first behaviour), Vanity (vanity
   1 / basin 0) or Standalone basin (basin 1 / vanity 0). Unchecking both shower and tub blocks the brief
   inline. Edits on the Result page count as a global change that makes the current plan stale.
2. **Wet rule is now "at least one shower or tub"** (replacing "shower always"). Every default template
   allows shower 0–n, tub 0–1 and accessories 0–2, so any valid list can solve. The rule applies only when
   a template allows a wet class, which keeps the drop-shower fallback template reachable. It is now
   labeled "shower/tub removed".
3. **Windows:** Add window centres a 600 mm window in the largest free gap on any wall, with several
   windows allowed per wall. It refuses only when no 600 mm gap exists. Windows are drawn sky blue at a
   fixed screen width.
4. **C5 forward check in the solver.** A single mid-wall window made a 5000 × 4000 room unsolvable. Mid-wall
   slots are tried first, their rough-ins fall inside the window span, and C5 rejected them only at full
   validation, after the 48-placement cap (ADR-034) had been spent. `roughInForwardOk` applies C5's
   opening and rough-in separation checks during the search. It uses the same measurements, so
   validation is unchanged.
5. **Photos:** files up to 10 MB are accepted and re-encoded in the browser as JPEG. The long side steps
   down 1600 → 800 px and quality 0.85 → 0.7 until the data URL is ≤ 900,000 characters. That stays under
   the server's 1,000,000-character photo cap and 1,000,000-byte request cap, which are unchanged. An
   8.5 MB PNG was sent as a 725,358-character request.

### Consequences
- Style presets no longer add a tub by themselves; the list decides.
- Existing limitation, unchanged: strips shorten usable wall length by opening spans rather than modelling
  the gap's position (`subtractKeepClear`). The forward check covers plumbing, but a non-plumbing fixture
  can still sit in front of a window. That is allowed today and deliberate for vanities (C6).

## ADR-036 — Dark themes and tolerant photo parsing (T-039)

### Decision
1. **Dark Luxury preset** (`dark-luxury`): granite floor, paint walls, matte black finish family, black
   metal, warm light, vessel basin / wall-hung toilet / freestanding tub preferences. Keywords are
   generic dark-style words (dark, moody, noir, gothic, charcoal, graphite, midnight, dramatic).
2. **Dark palettes paint dark walls.** `wallHex` used to lean 25% from the default greige toward the
   palette's lightest colour, so no palette could darken a room. When the palette's mean sRGB lightness
   is below 0.35, walls now use its darkest colour, lifted 6% toward the greige. Without a preset, such a
   palette also defaults the floor to granite instead of white marble.
3. **A preset owns the paint colour.** When a preset is set, paint walls use the preset's palette, not
   the palette that came with the décor (the offline twin or AI may detect a preset but return a
   generic palette).
4. **Photo scan normalises the echoed shape.** The vision model copied `room.openings` (swing as
   `{side, leafDimsMm}`, windows without swing), which the strict parser rejected as malformed. The room
   context now lists existing openings in the operation shape, and the swing is normalised to
   `"in" | "out"` before strict parsing. Everything else stays strict.
5. **Photo scans wait 25 s** (`PHOTO_TIMEOUT_MS`) instead of the 10 s text default, because a vision call
   on a full photo is slower and timed out under provider load. The browser already waits 30 s. Still one
   attempt, no retries, so the 40 RPM budget is unchanged.

### Consequences
- Industrial Loft keeps light paint logic (mean lightness 0.37) and brick walls anyway.
- The vision model tends to echo the existing openings rather than find new ones; accuracy is a model
  limit, not a parsing one.

## ADR-037 — Low-budget recovery and priority tabs on the result (T-040, T-041)

### Decision
1. **Measure the budget deficit for the brief as chosen.** The deficit was measured only when the generic
   per-class estimate exceeded B_max, and that estimate ignores pinned classes. A vanity pinned on a
   ₹40–60k budget therefore reached the out-of-scope wall with no raise-budget option. The cheapest
   buildable plan is now also measured when no archetype survives the pre-filter. It is found by trying
   rising ceilings (1.25×, 1.5×, 2×, 3×, 5× B_max, then unlimited), because a single unlimited search can
   exhaust the bounded backtracking budget on premium sets before reaching the cheap layout.
2. **Dropping a pinned sink frees the other sink.** A sink is mandatory, so the drop-class path for a
   pinned vanity (or basin) also releases the opposite sink class, labeled "vanity replaced by a
   standalone basin".
3. **The result shows Value / Balanced / Eco / Luxury tabs** instead of a Priority select (removed from the
   Taste page and the adjust panel). Each tab is the argmax of the same cached, validated candidate set
   under that priority's weights (`alternativeProfiles`, now reading `cachedValidatedCandidates`), so all
   tabs are within B_max and switching never re-solves. Each tab shows its price and its difference from
   the selected tab; a tab that picks the same products as an earlier one is tagged "Same as …". A fresh
   solve opens on Balanced; a re-optimize keeps the chosen tab. Render, 2D, BOM and exports follow the tab.
4. **Recovery options carry their relaxed brief** (`RelaxationPlan.input`), so each option has its own tabs.
5. **Luxury leans to the top of the range.** Its cost curve now peaks at B_max (`costCurve.luxury.pivot:
   "max"`); Balanced keeps its peak at B_target.
6. **Décor follows the taste, not the tab.** Switching tabs reuses the current décor style, re-placed on
   the new fixtures, without a new AI call (protects the 40 RPM budget).

### Consequences
- Tabs can repeat each other on tight budgets or where the catalog has nothing better; the tag says so.
  With the default brief (₹1.8L / ₹2.5L) Luxury equals Balanced: the only pricier candidate scores lower
  on luxury points.

## ADR-038 — Premium catalog additions (T-042)

### Decision
1. **11 real KOHLER India SKUs added** (`verified_additions.ts`, checked 2026-09-22), each with identity,
   dimension and MRP evidence from the official India PDP (embedded `Color.GST.Details_ss` and
   `ProductOverall*Inches_s` fields, raw inch strings quoted in the evidence note):
   Components faucet EX28093IN-8 (Matte Black, Vibrant French Gold, ₹39,500), Components tall faucet
   EX28094IN-8 (BL, AF, ₹49,400), Statement rainhead 26294IN (BL ₹58,400, AF ₹52,300), ModernLife rainhead
   24470IN (BL ₹58,800, AF ₹52,500), and black vessel basins KOHLER VIVE 28784IN-7 (₹20,000), Veil
   77171IN-7 (₹25,000) and Sveda 30109IN-HB1 (₹43,500).
2. **Two finishes added** with KOHLER's own colour names: `vibrant_french_gold` (brushed_gold family) and
   `black_ceramic` (matte_black family). Black ceramic renders with a dark ceramic material.
3. **Excluded, not invented:** ModernLife Edge faucets (no flow rate published) and the premium wall-hung
   toilets (EC27791IN-HB1, EC27792IN-0, EC31014IN-0, EC26995IN-2-0), whose flush volume comes from a
   separate in-wall tank that KOHLER India does not list. Catalog validation requires water data, and it
   was not loosened.
4. **Luxury seed aligned with scoring.** The luxury seed now ranks SKUs by the same points `u_luxury`
   uses (finish points + premium tags, max 4) instead of the raw tag count, and adds one-swap size
   variants (smallest / roomiest same-points alternative per product) so spaciousness can still move a
   luxury plan when the room allows it.
5. **Backtrack budget 10,000 → 20,000.** The larger pools exhausted the bounded search on one proven
   feature brief (smart + soft-close); exhaustion took ~25 ms, the solve at 20,000 takes ~35 ms.

### Consequences
- With the default brief (₹1.8L / ₹2.5L) the four tabs are now distinct (₹71,470 / ₹171,500 / ₹91,500 /
  ₹2,15,500). In the 2400 × 1800 default room luxury has no roomier option (the larger vanity does not
  fit), so the airy-vs-compact test runs in a 3000 × 2400 room.
- Premium toilets remain thin (smart toilets at ₹78,500 / ₹82,000, then ₹4.7L); adding the wall-hung
  premium toilets needs a sourced in-wall tank flush volume.

## ADR-039 — Large rooms feel furnished (T-043)

### Decision
1. **Room-scaled décor.** `decorCaps(geometry)` gives the extra pieces a room gets: none up to 5 m² of floor,
   then one placed filler per further 0.9 m² (a 4000 × 3000 room gets 7), within MAX_DECOR_ITEMS (now 24).
   Rooms over 8 m² may light a fourth lamp (MAX_DECOR_LIGHTS is 4 at parse time; placement allows 3 or 4).
   Fillers that find no legal spot do not use up the quota.
2. **New presentation-only types**: towel ladder, cabinet, side table, floor mirror, bath mat, tub tray,
   niche shelf, laundry basket, floor lamp and LED strip (lights), and sculpture, plus a `beside-tub`
   anchor. Tall furniture stands against a wall; bath mats may lie in front clearance like rugs; the tub
   tray only ever rests on a tub rim. Freestanding tubs away from the walls get spots at their ends.
3. **Per-style fillers** (`StyleDefinition.fillers`, 12 each, art and lights included) and a generic list
   for custom styles. The AI décor prompt asks for `targetItems` (6–24) in large rooms; the engine tops up
   anything missing deterministically, with no extra AI calls.
4. **Two basins in big rooms.** With an Auto sink and a floor of 9 m² or more, the engine first tries two
   standalone basins (each with its own faucet), falling back to the usual sink preference when they do
   not fit or are unaffordable. A pinned sink choice is never doubled.
5. **Accent wall.** With a style (or a dark palette), the wall nearest the shower (else the tub) takes the
   style's accent material (e.g. granite for Dark Luxury, white oak for Coastal).
6. **Not done:** a glass shower screen (the white panel in the reported screenshot was the door leaf);
   head-only showers have no reserved zone, so a screen could overlap fixtures. Logged in TODO.

## ADR-040 — OpenRouter as the AI provider (T-044)

### Decision
NVIDIA's free NIM endpoints answered every request with 503 ("Service temporarily overloaded" and
"Worker local total request limit reached (16/16)"). The existing client already speaks the
OpenAI-compatible chat API, so the provider is chosen by `NIM_BASE_URL`:
- `https://openrouter.ai/api/v1` sends `reasoning: { effort: "none" }`; NVIDIA keeps
  `chat_template_kwargs: { enable_thinking: false }`.
- OpenRouter `:free` models allow 20 requests per minute and 50 per day without purchased credits
  (1000 per day with at least $10 of credits). The request pools become 6 décor + 12 general = 18 per
  minute for OpenRouter; NVIDIA keeps 10 + 25 = 35. Still one attempt, no retries.
- Two models: `nvidia/nemotron-3.5-lightning:free` (`NIM_MODEL`, text only) for taste mapping, décor
  and accessories, room edits, narration and tradeoffs; `inclusionai/ling-3.0-flash-vl:free`
  (`NIM_VISION_MODEL`, image input) for photo parsing. The env variable names keep their `NIM_` prefix
  to avoid churn. OpenRouter's free limits apply per account, so both models share the 18/min pools.

### Consequences
- The 50-requests-per-day free cap is the practical limit for demos; every failure still falls back
  to the deterministic offline twin.

### Addendum (T-044, same day) — free-model fallback chains
Live tests showed each free model alternating between fast answers and upstream 429s (OpenRouter's
shared provider pools), and Nemotron 3.5 Lightning taking 38–90 s. With the user's approval the
one-attempt rule is relaxed for this case only:
- `NIM_MODEL` / `NIM_VISION_MODEL` accept a comma-separated chain. Only an upstream 429 (a fast "busy"
  reply) moves to the next model; timeouts, other errors and our own limiter stop the chain. At most
  3 attempts, each reserved from the same 18/min pools.
- Text chain: gemma-4-26b-a4b-it → nex-n2.5-mini → nemotron-3.5-lightning. Photo chain:
  ling-3.0-flash-vl → gemma-4-26b-a4b-it → nex-n2.5-mini (all `:free`).
- Décor (a long answer that loads behind the finished plan) waits 25 s on the server and 30 s in the
  browser. Replies wrapped in a markdown fence are unwrapped before strict parsing.
- Live check: photo 3.6 s (ling), décor 8.5 s (gemma 429 → nex), taste 2.0 s (gemma 429 → nex).

