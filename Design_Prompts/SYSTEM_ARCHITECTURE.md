# KOHLER AI Bathroom Designer & Planner — System Architecture

> **Document status:** Authoritative *implementation* architecture for the KOHLER AI Bathroom
> Designer & Planner prototype. This document explains **HOW the system is structured and how the
> parts interoperate** — it is not a requirements document (see `docs/PRD.md`) and not an
> optimization specification (see `docs/OPTIMIZATION_SPEC.md`). It formalises, as executable
> design, the decisions already accepted in `docs/DECISIONS.md` (ADRs 001–018) and the design
> session logs. It adds **no new requirements**.
>
> **Scope:** Hackathon MVP. The system deliberately favours a simple, offline, deterministic-first,
> in-process architecture over distributed or database-backed designs (ADR-001, ADR-011, ADR-012,
> ADR-018).

---

## 1. Architecture overview

One product, three packages in a **single npm-workspaces monorepo**, all TypeScript:

```
kolher/
├── packages/
│   ├── engine/      # Deterministic core. Pure TS. Zero UI deps. The single authority.
│   ├── web/         # Framework-free TS UI: DOM + Canvas 2D + procedural three.js 3D.
│   └── server/      # Thin Node built-in HTTP server: static host + optional NIM AI proxy.
├── docs/            # PRD, OPTIMIZATION_SPEC, DECISIONS, SYSTEM_ARCHITECTURE, PRODUCT_CATALOG_SCHEMA
└── tasks/           # Execution state (TASKS.md) and parking lot (TODO.md)
```

The load-bearing property is **ADR-001**: the deterministic engine runs **in the browser**,
consumed directly (`web → engine` as an in-process module). The `server` is deliberately thin —
it serves the built `web` assets and proxies the optional hosted-AI calls. There is **no
back-end solve round-trip in the hot path**. This structurally guarantees:

- **Offline, no-key, no-GPU** (`PRD N1/N2`): the whole core loop runs in-browser; the LLM is
  best-effort enhancement.
- **One source of truth for correctness** (`PRD D2`): the *same* engine serves every path, so
  `render = catalog geometry` and the validator agree by construction.
- **Regenerations stay fast** (`PRD N3`, ~2 s) because the solve runs locally and re-optimization
  is incremental.

**Three-layer mental model** (matches `PRD §8`):

```
 User input
   │
   ▼
┌────────────────────────────── AI LAYER (advisory) ───────────────────────────────┐
│  NIM/Kimi-K3 (hosted) OR offline template engine (fallback).                     │
│  taste→features · photo proposals (seed only) · narration bound to receipt.      │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                       │  feature-constraint set, free text, preference
                                       ▼
┌────────────────────────────── DETERMINISTIC CORE (authority) ────────────────────┐
│  geometry · rules/validation · compatibility · budgets/cost · search ·            │
│  scoring/ranking · relaxation diagnostics · decision receipt · render geometry    │
│  (fully self-contained, offline, in-browser)                                      │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                       │  valid plan + receipt + render geometry
                                       ▼
┌────────────────────────────── PRESENTATION LAYER ────────────────────────────────┐
│  2D layout (Canvas) · 3D procedural (three.js) · BOM/pricing · decision-receipt   │
│  panel · AI narration on the valid plan                                            │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**Hard structural consequence** (unchanged from PRD/ADR-002): an invalid plan never exists as an
artifact. The AI can only select/explain/curate from the valid set the deterministic solver
emits. That is what makes the product a *planner*, not a *chatbot*.
---

## 2. Component architecture

```
┌─────────────────── packages/engine (pure TS, no DOM) ────────────────────────────┐
│  geometry        polygon/normalize, wall strips, footprint AABBs, slot grid,     │
│                  clearances, door-swing arcs, plumbing distances                 │
│  rules           declarative rule metadata + imperative evaluators (C1–C8);      │
│                  per-rule verdict + first-class fired-rule trace                 │
│  catalog         schema-validated SKU loads, quarantine, compatibility graph,    │
│                  substitute sets                                                 │
│  input           InputSet I assembly, Step-01 confirm gate,                      │
│                  taste→feature-constraint set                                    │
│  solver          constructive layered CSP: archetype → SKU binding → wall-strip   │
│                  placement; forward-checking; deterministic tie-breaks;          │
│                  bounded backtracking                                            │
│  objective       anchored utilities u[i]∈[0,1] (cost/space/water/luxury/          │
│                  maintenance) + priority & spaciousness weight tables            │
│  optimize        scoring Σ w[i]·u[i], ranking, tie-break, argmax                 │
│  relax           fail-cause tracing → relaxation menu → 1–3 validated plans      │
│                  → out-of-scope wall                                             │
│  receipt          deterministic decision receipt (top-k + per-term scores +      │
│                  fired-rule trace + data-gaps + relaxation menu)                 │
│  cache           coarse component-level candidate cache, instant re-score,       │
│                  render cache, invalidation keys                                 │
└──────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────── packages/web (framework-free TS UI) ─────────────────────────┐
│  views/       screen scenes (Room → Taste → Result → Adjust → Export)            │
│  store        session state (single source of truth for UI)                      │
│  render2d/    Canvas direct projection of engine AABB + trace annotations         │
│  render3d/    procedural three.js scene from catalog geometry                     │
│  receipt/     decision-receipt / comparison panel                                │
└──────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────── packages/server ─────────────────────────────────────────────┐
## 3. Data-flow

The full user-to-re-optimisation flow. `→` denotes a typed call; the gate is a hard checkpoint.

```mermaid
flowchart TD
    U[User input: photo seed + typed dims + taste + priority + budget]
    IP[Input processing / Step-01 gate]
    BR[Bathroom representation: authoritative polygon<br/>+ confirmed openings + zones + slot grid]
    PG[Product candidate generation:<br/>archetype → SKU binding]
    CV[Constraint validation:<br/>C1–C8, all hard, fired-rule trace]
    OP[Optimization: Σ_i w_i·u_i scoring + ranking]
    RK[Ranked candidate selection + decision receipt]
    LG[Layout generation: plan + BOM + budget summary]
    VZ[Visualization: 2D Canvas + 3D procedural<br/>render-to-BOM]
    FB[User feedback: priority/budget/local edit/door]
    RO[Re-optimization: re-score | replace-strip | full re-search]
    RV[Full re-validation]
    RL[Relaxation: fail-cause trace<br/>→ hand-ordered menu]
    OOS[Honest out-of-scope]

    U --> IP
    IP -- "confirmed?" --> GF
    GF --> PG
    PG --> CV
    CV -->|"valid"| OP
    CV -->|"invalid"| RL
    OP --> RK[Rank]
    RK --> LG
    LG --> VZ
    VZ --> FB
    FB --> RO
    RO --> RV
    RV -->|"valid"| LG
    RL -->|"1–3 validated plans"| LG
    RL -->|"no valid space"| OOS
```

The **Step-01 gate** (authoritative polygon + confirmed openings) is a hard block: the solver
never runs on unconfirmed input (`OPT §2`, `OPT §13.1`, `PRD §7.1`). Similarly, every
re-optimized plan is fully re-validated before it surfaces (`OPT §10.1.4`).

---

## 4. Component responsibilities

| Component | Responsibilities |
|---|---|
| **engine/geometry** | Normalize confirmed polygon; decompose into wall strips (1D usable length after keep-clear); footprint AABBs; zone spans; slot-grid discretisation; door-swing arcs; clearance math. Produces the geometry both renderers mirror. |
| **engine/rules** | Enforce determinism. Declarative metadata + imperative evaluators; per-rule verdict + fired-rule trace with the exact rule/value used (feeds narration & relaxation). Config-driven values (one file per rule). |
| **engine/catalog** | Load SKUs; strict-schema validation; **quarantine** invalid/gap rows (removed from search, surfaced as data-gaps); build compatibility graph (rule-derived defaults + authoritative curated override graph) + substitute sets; expose geometry descriptors for rendering. |
| **engine/input** | Assemble formal InputSet `I`; gate on authoritative confirmation; normalize taste→feature-constraint set; map priority/spaciousness/budget to config. |
| **engine/solver** | Constructive layered CSP search: feasible archetypes → SKU binding (compat + cost-aware pruning) → wall-strip placement (forward-checking, bounded backtracking, deterministic tie-breaks). Every emitted candidate is valid by construction. |
| **engine/objective** | Produce anchored utility per term `u[i]` and the priority-based weight profile `w` (with bounded spaciousness modifier on the space term). |
| **engine/optimize** | `argmax Σᵢ wᵢ·uᵢ` over valid candidates; deterministic tie-break (space-efficiency → cheaper → fewer fixtures → lexicographic id); produces top-k + ranking. |
| **engine/relax** | When no valid candidate exists: fail-cause tracer (blocked rule + min-gap) → hand-ordered relaxation menu (swap, shrink, drop, raise, move) → re-searches each, validates independently, yields 1–3 distinct valid relaxed plans or the out-of-scope wall. |
| **engine/receipt** | Deterministic decision-receipt: top-k + per-term score matrix + fired-rule trace + data-gaps + (when infeasible) blocked trace + relaxation menu. This is the only fact-set the AI may narrate. |
| **engine/cache** | Coarse component-level cache keyed on `(geometry ∪ archetype ∪ feature-set)` storing weight-independent per-term utilities (so priority changes are instant re-scores) + rendered 2D/3D cache. |
| **web/store** | Single session-state store; orchestrates the UI flow and engine calls. |
| **web/render2d** | Canvas 2D direct projection of engine AABB + trace annotations (dims, clearances). Deterministic, offline. |
| **web/render3d** | Procedural three.js scene built from engine positions and the catalog `geometry_descriptor`. |
| **web/ui + receipt** | Step screens, receipt panel, loading/empty/error states, export. |
| **server** | Serve built web assets; proxy AI calls; hold secrets; host offline fallback. |
| **ai adapter** | Thin, stable, `.env`-switchable interface: NIM/Kimi-K3 client ↔ offline template engine. Both return receipt-boundable structured facts. |

---
│  static/    serve built web assets (npm install && npm run)                     │
│  ai/        NIM/Kimi-K3 proxy (POST /api/nim) + validation + degradation guard  │
└──────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────── ai adapter (engine-adjacent) ────────────────────────────────┐
│  NIM client (hosted)  |  offline template engine (rule narration + fallback)     │
## 5. Data models

Key types (as TS types in `engine`, mirrored here). They mirror `OPT §4` and `PRD §11`
— no new fields.

### 5.1 Room & geometry
```ts
interface Vec2 { x: number; y: number }
interface RoomPolygon { vertices: Vec2[]; ccw: boolean; wallThicknessMm: number }
interface WallStrip { id: string; wallSide: string; origin: Vec2; direction: Vec2;
                       usableLengthMm: number }   // length minus keep-clear regions
interface Opening { id: string; wallId: string; kind: "door"|"window";
                    alongOffsetMm: number; spanMm: number;
                    swing?: { side: "in"|"out"; leafDimsMm: { w: number; d: number } } }
interface BathroomRep { polygon: RoomPolygon; strips: WallStrip[]; openings: Opening[];
                        plumbingZones: Zone[]; obstacles: Obstacle[]; slotGridMm: number /* ≈25 */ }
```

### 5.2 Fixture & candidate
```ts
type FixtureClass = "toilet"|"basin"|"shower"|"tub"|"vanity"|"faucet"|"accessory"|...
interface Fixture { sKUId: string; class: FixtureClass; footprintMm: { w:number; d:number;h:number };
                    classAffinity: Zone[]; orientation: number /* deg */; featureTags: string[]; zones: Zone[] }
interface FixtureBinding { fixture: Fixture; wallStripId: string; posAlongMm: number; orientation: number }
interface Candidate  { classSet: string[]; bindings: FixtureBinding[];
                        cost: number; clearanceDeltas: Record<string, number>;
                        compatOk: boolean; geometryValid: boolean }
```

### 5.3 SKU / catalog (seed per PRD §11)
```ts
interface SKU { model_id: string; name: string; category: string; fixture_class: FixtureClass;
               dim: {w:number; d:number; h:number} /* mm */; finish_options: string[];
                price: number; image_ref?: string; geometry_descriptor: GeometryDescriptor;
               feature_tags: string[] /*smart, low_flow, floor_mount,... */;
               compatibility: string[] /* curated ids — the authoritative override graph */;
               substitutionIds?: string[] /* relaxation swap set */ }
interface CatalogState { skus: SKU[]; compatibilityGraph: Map<string, string[]>;
                        substitutes: Map<string, string[]>; dataGaps: string[] /* quarantined */ }
```

### 5.4 Optimization input set `I` & output
```ts
interface Budget { bMax: number; bTarget: number }              // hard / soft
interface InputSet { polygon: RoomPolygon; openings: Opening[]; confirmed: boolean;
        featureConstraints: string[]; priority?: Priority; spaciousness?: Spaciousness;
        budget: Budget; config: Config }  // config carries rules, weights, anchors, archetypes, MIN_BUDGET
interface Plan   { selectedCandidate: Candidate; firedTrace: RuleVerdict[]; perTermScores: Scores;
                     cost: number; budgetSummary: BudgetSummary; receipt: DecisionReceipt }
interface BOM     { lineItems: {model_id:string;qty:number;finish?:string;price:number}[];
                     total: number; byZone: Record<string, LineItem[]> }
type BuildOutput = { plan: Plan } | { relaxationMenu: RelaxationPlan[] } | { outOfScope: OutOfScope }
```

### 5.5 Decision receipt (feeds narration & UI)
```ts
interface DecisionReceipt { topK: CandidateScore[]; scoreMatrix: Record<string, Scores>;
        firedRuleTrace: RuleVerdict[]; constraintsTension?: string[]; dataGaps: string[];
        relaxationMenu?: RelaxationPlan[]; minBudget?: number; honestyFrame?: string }
```

---

## 6. API / service contracts

Because the engine is pure TS called in-process, its contract is a set of typed function
calls; only the AI path and static asset mount cross a network boundary.

### 6.1 Engine (in-process, typed calls)
| Call | Input | Output | Responsibility | Validation | Failure |
|---|---|---|---|---|---|
| `solve(I)` | `InputSet` | `BuildOutput` | whole pipeline | `I` gate-passed; catalog validated | infeasible → `relaxationMenu` (never invalid/hang) |
| `validate(candidate, I)` | candidate + `I` | `ValidationResult{trace, pass}` | C1–C8 | rule evaluators | `pass:false` + full trace |
| `reoptimize(prev, change, I)` | prev plan + change kind | updated plan | incremental (re-score/replace/re-search) | full re-validation | global-change → full re-search |
| `relax(I, blockers)` | `InputSet` + failed trace | `RelaxationMenu[1..3]` or OOS | relaxation protocol | each item re-validated | honest out-of-scope |
| `report(receiptPlan)` | plan | `DecisionReceipt` | explainability fact-set | receipt schema | — |

### 6.2 Server (thin HTTP)
| Endpoint | Input | Output | Responsibility | Validation | Failure |
|---|---|---|---|---|---|
| `GET /` + static | — | built `web` assets | offline host | path allowlist | 404 → SPA fallback |
| `POST /api/nim` | `{ request, image? }` (bounded) | `{ structuredFactSet }` or `{ fallback:true }` | AI tasks: taste/photo/narration | schema, size cap, timeout | run offline fallback; 2xx ± masked fact set |

### 6.3 AI adapter (thin,.env-switchable)
```ts
interface AICli {
  tasteToFeatures(text: string): FeatureConstraints
  photoProposal(image: Blob): { doors?: Opening[]; windows?: Opening[] }   // advisory only
  narr(receipt: DecisionReceipt): string                          // receipt-bound prose
  tradeoffs(menu: RelaxationPlan[]): string
  // offline impl: rule/template twin of each above
}
```
- **Responsibility bound** (`ADR-013/014`): every narration claim must bind to a
  `DecisionReceipt` field; AI never emits numbers that become hard constraints.
- **Failure contract**: AI is *optional*; correctness never depends on it. On failure/
  timeout/absence → the offline template engine fully covers the demo path.



---

**Module discipline:** every `engine` module is pure TS with no DOM/network/persistence
dependency. Cross-module edges are typed function calls (not HTTP), so the engine is
unit-testable and trivially portable to a future backend without rework (`ADR-008`/`ADR-011`).

---
## 7. AI vs deterministic responsibility matrix

| Concern | Authority | Where |
|---|---|---|
| Natural-language / taste interpretation | **AI** (→ feature-constraint set) | `ai` adapter → `engine/input` |
| Photo / layout interpretation | **AI, seed-only** (never a constraining number) | `ai` adapter → `web` preview |
| Narrative & explanation | **AI** (bound to the receipt) | `ai` adapter → `web/receipt/` |
| Relaxation-menu presentation | **AI phrasing only; feasibility = engine | `ai` adapter |
| Aesthetic feature→preference mapping | **AI** (feature set; engine picks within it) | `ai` adapter |
|---|---|---|---|
| Dimensions / geometry / collision / clearances | **Deterministic** | `engine/geometry` |
| Compatibility (pair-level) & substitution | **Deterministic** (curated override graph) | `engine/catalog` |
| Constraint validation & clearance math | **Deterministic** | `engine/rules` |
| Cost sums & budget ceiling | **Deterministic** | `engine/optimize` |
| Placement & candidate generation | **Deterministic** (CSP solver) | `engine/solver` |
| Scoring / ranking / tie-break | **Deterministic** (anchored `Σ wᵢuᵢ`) | `engine/optimize` |
| Relaxation quantification | **Deterministic** | `engine/relax` |
| Render geometry | **Deterministic** (`render = catalog geometry`) | `engine/geometry` → `web/*` |

**Guardrail rule** (`ADR-002`, `PRD §8/§9`): the AI *does not vote on the objective, candidate
set, placement, budget, or feasibility*. Its only influence is (a) the **feature-constraint set**
(the engine is bound to respect it), (b) **narration/curation within the valid set**, (c)
**relaxation-menu phrasing**. Every AI output is passed through the validator before anything
surfaces.

---

## 8. Optimization integration

The pipeline connects as a **single anchored weighted-scalar objective** with deterministic
sublayers (`ADR-005/006`, `OPT §1–§10`, `§15–§17`):

1. **Candidate generation** (`engine/solver`): layered, constraint-first. Feasible archetypes
   (per-class count ranges) → SKU binding (hard compat + cost-pruned) → discrete wall-strip
   placement (CSP, forward-checking, bounded backtracking). No naive full-assembly enumeration.
2. **Hard-constraint validation** (`engine/rules` + `engine/catalog`): every emitted candidate
   runs C1–C8; the result is `ValidationResult{trace, pass}`; only valid candidates reach
   scoring. Any rule value lives in config (one file per rule) so the same file drives validation
   and narration.
3. **Soft-objective utilities** (`engine/objective`): anchored absolute normalization of the five
   terms `u_cost, u_space, u_water, u_luxury, u_maintenance` (PRD §6, OPT §6); within-set
   min/max only where no external anchor exists (`OPT §7`).
4. **Multi-objective → one scalar** (`engine/optimize`): `score = Σᵢ wᵢ(priority)·uᵢ` with a bounded
   spaciousness modifier on the space term only; `best = argmax score`.
5. **Ranking & demo alternatives**: ranking yields the top candidate; the demo `3-ways` uses a
   fixed, deterministic set of alternative *priority-level weight profiles*, each re-scored and
   re-validated (`ADR-005`), so three *intent-distinct* valid plans all trace to the same objective;
   true Pareto enumeration is explicitly out (over-engineering, `ADR-006`).
6. **Determinism & caching** (`engine/cache`): per-term utilities are weight-independent, so the
   candidate search can be cached per `(archetype ∪ geometry ∪ feature-set)` key; weight-only
   changes are re-scores; local edits re-place the affected strip; global changes re-search
 RNG / wall-clock / order / external-key dependence — every result is fully re-validated
   (`OPT §10.1/§12/§14`).
7. **Relaxation** (`engine/relax`): on an empty valid space, fail-cause tracing produces a
   measure (blocked rule + min-gap) → hand-ordered, independently re-validated menu → 1–3 distinct
   distinct relaxed plans or the honest out-of-scope wall.

---

## 9. Frontend architecture

Framework-free vanilla TypeScript (`ADR-011`;confirmed open choice). Three cooperating shards:

- **`web/store`** — a single typed session-state store + subscribe/render loop. Owns the current
  `InputSet`, authoritative-confirmation payload, candidate set, selected plan, and receipt; and drives
  recomputation via the engine. No framework-reactivity lifecycle.
- **`web/views/*`** — pure functions `view(state) → Node` over the store; explicit `loading | empty |
  error` states per screen (per UX/Impeccable/Material principle + `ADR-018` demo rails). Renders
  are re-invocations of pure functions.
- **`web/render2d` + `web/render3d`** — the 2D Canvas projection and the procedural three.js scene,
  each built directly from `engine` geometry (both ``render = catalog / BOM by construction``).
  `2D/3D` toggle; cached recompute (`ADR-016`).

Screen flow (`PRD §14`): `Room (upload + dims + preview + confirm)` → `Taste (feature chips +
priority)` → `Result (plan/BOM + 2D/3D + decision-receipt panel)` → `Adjust & re-roll`
(incremental re-optimization) → `Export`. Each step carries its own `loading | empty | error`
state (e.g. gate-blocked, no-valid-plan → relaxation menu, NIM offline → template narration).
---

## 10. Error handling (failure & edge behaviour)

| Failure | Behaviour (`OPT §13`, `ADR-015/016`) |
|---|---|
| Missing / ambiguous / invalid dimensions | Strict **Step-01 gate**; pipeline blocked with an explicit "add+confirm" message until confirmed |
| Missing / unclean catalog data | Strict-schema **quarantine** at load (excluded from search, listed as data-gaps/warnings) |
| No feasible design (impossible brief) | Full trace-driven relaxation: fail-cause → hand-ordered menu → 1–3 validated relaxed plans, or an honest out-of-scope wall with min viable cost |
| No compatible products | Deterministic equivalency (walk compat-graph → substitute set); if void → honest out-of-scope |
| Ties / ultra-low budget | Deterministic tie-break (space-efficiency → cheaper → fewer fixtures → lexicographic id); `MIN_BUDGET` gate |
| Optimization failure (empty valid set) | Turns to relaxation by design; never a hang (bounded backtracking budget) |
| AI failure / no network | Offline fallback fully covers taste/narration/photo signals (`ADR-013`) |
| API / asset failure | Server returns structured fallback; UI renders the offline path |

**Core guarantee (`D2`/`ADR-017`):** no invalid plan ever surfaces — every output (normal,
relaxation, re-score, local-edit, re-search) is fully re-validated before it appears. The
"honest failure wall" is a positive, narrated state, not a crash or a fake plan.

---

## 11. Security considerations

- **Secrets are server-side only**: the NIM key lives solely in `server/.env`; the LLM is invoked
  server-side. The web bundle never contains an API key.
- **Input validation** on both server and engine: room-input and taste-text length/type caps;
  numeric bounds; inner schemas on all engine inputs.
- **Server endpoints**: only static mount + `POST /api/nim`; path-traversal guards on static;
  `POST` body-size bound; request-type validation; per-call timeout.
- **Image handling**: images go to the server only for the optional hosted-vision path; they are
  **not persisted**, validated for type/size, and discarded after the call; offline mode never
  transmits them.
- **No arbitrary code execution**: no `eval`/string-to-code; engine is data-only typed functions.
- **Honesty framing** (`PRD N6`): the demo stamps "planning-level, verify with a licensed
  professional"; the receipt schema binds narration so the LLM cannot invent facts (`ADR-014`).
- The **judge-machine scenario** runs fully offline and key-free, so the security posture never
  blocks `npm install && npm run`.

---

## 12. Performance considerations

- **Bounded search space** (`ADR-016`, `OPT §17`): ~40–80 SKUs; discrete slot grid (~25 mm);
  archetype templates; bounded backtracking → deterministic, ≤~2 s typical regeneration.
- **Coarse caching** (`ADR-016`): candidate result cached per `(geometry ∪ archetype ∪
  feature-set)` as weight-independent per-term components; `priority/spaciousness` changes are
  instant re-scores (`OPT §10`/`§17`).
- **Incremental re-optimization** by change type (weight → re-score; local → re-place strip;
  global → re-search) — targeted, context-preserving via `OPT §10.1`.
- **Render caching** for the 2D/3D views so toggling and post-edit re-render are instant.
- The only heavier client work is rendering, bounded by procedural scenes; a downstream model or
  real backend is deferred out of the prototype.

## 13. Testing architecture

Vitest gate-enforced suites across the monorepo (`ADR-017`, `OPT §18`):

| Suite | Covers |
|---|---|
| **`engine` unit** | Geometry, rules C1–C8, objective/anchor stability, catalog-quarantine, weight tables |
| **Determinism / hash** | `hash(inputs) → hash(plan)` stable across repeated and reordered runs |
| **Hard-rule compliance** | Property-style over valid candidates AND injected-invalid mutants (must be rejected) |
| **Solver** | Candidate generation, forward-checking, bounded backtracking budget, tie-breaking |
| **Relaxation / 3-ways** | Every relaxed plan valid and minimal-sufficient; "3-ways" yields 3 distinct plans |
| **Objective / priority oracle** | Each priority selects its expected-class best |
| **Edge cases** | Tiny room, missing-dims gate, no-compatible-pairs, quarantine, ultra-low budget, ties |
| **Diff / integration** | Plan → BOM → render equality (`render = catalog geometry`), re-optimization correctness |
| **Latency regression** | Typical regenerate ≤~2 s bound |
| **web / UI** | Store flow, pure view-render helpers, optional DOM smoke |

Design principle: **contracts first** — the engine's typed error paths are the test seams; each
module runs independently (no UI requirements), so it is trivially unit- and property-testable.
The rule validator is tested against injected-invalid mutants so the "no invalid output"
guarantee is demonstrated, not merely asserted.

---

## 14. MVP / Stretch / Production scope

| Tier | Scope |
|---|---|
| **MVP (required for demo)** | Room entry (photo seed + confirm-dims + rectangle/L fallback); taste→features; rule engine C1–C8; constructive search + validation; BOM/cost; priority + spaciousness re-weight; decision-receipt + narration (NIM or offline); 2D + 3D procedural; relaxation "3 ways"; offline no-key run; 4 deliverables |
| **Stretch (time-permitting)** | Scripted hero "show me 3 ways" in one flow; a single polished 3D hero still for the deck; finish-swatch polish; optional photo→proposal preview (non-blocking `ADR-009`) |
| **Production (out-of-now, documented)** | Real persistence/multi-user/auth; full catalog + trade integration; cert-grade rules; e-commerce; AR/dealer-lead; hosted GPU/scaling — recorded, not dropped (`ADR-018`) |

`MVP` maps to `PRD §21`; anything not listed is intentionally out-of-scope and documented so it
reads as curated seniority, not random thinness.

---

## 15. Technology choices & rationale

| Choice | Rationale |
|---|---|
| **TypeScript everywhere** | single type language across engine/web/server; typed contracts |
| **npm workspaces monorepo** | clean package boundaries (engine/web/server); offline `npm install` |
| **Engine: framework-free pure TS** | `ADR-001/011` — sole authority, zero UI deps, testable, portable |
| **Vite** | fast dev server/build; static output the thin server hosts |
| **Three.js (3D)** | `ADR-010` procedural renderer; in-browser, no GPU required |
| **Canvas 2D** | `ADR-010` direct AABB projection; light, deterministic |
| **Node built-in HTTP server** | `ADR-011` — static host + AI proxy with no extra dependencies |
| **Vitest** | `ADR-017` gate-enforced determinism/hard-rule suites |
| **Catalog as JSON/TS files** | `ADR-008/012` — schema-validated, quarantined; no SQLite |
| **NIM / Kimi-K3 + offline template** | `ADR-013` `.env`-switchable; deterministic offline fallback |

No microservices, no database, no exotic solver. Every choice traces to a prior ADR.

## 16. Key architectural risks

1. **Browser-solve latency at upper SKU/geometry bounds** — mitigated by bounded archetypes,
   discrete grid, component caching, and the ~2 s regression timer.
2. **Determinism flakiness** (float precision, polygon ordering) — normalize input, sort
   entities, fixed-precision math; the determinism/hash gate runs in every suite.
3. **Cache invalidation on the wrong keys** (component re-scores) — typed `CacheKey` =
   `(geometry ∪ archetype ∪ feature-set)`; invalidation is covered by tests (`ADR-017/016`).
4. **In-process engine coupling** — the engine stays DOM-free and framework-free; tests call
   only functions, so a later server extraction is a thin step, not a rewrite.
5. **LLM-dependent demo credibility** — correctness never depends on the LLM; the receipt panel
   enforces it on screen, and the offline template is exercised in the demo/video.
6. **`render = catalog geometry` drift** — one engine geometry source drives both 2D and 3D;
   plan→render equality is asserted in tests, keeping the audit-clean claim true.

---

## 17. Implementation order & dependencies

The engine is the differentiator and the ordering foundation; tests are enforced per stage
(`ADR-017`).

```
Stage A   engine geometry + rules + schema            → unit tests C1–C8
Stage B   catalog fixtures + compatibility graph +    → tests: quarantine + substitutes
              substitution sets
Stage C   solver (archetype → binding → placement)     → property/hard-ok tests
Stage D   objective + optimize + receipt               → tests: oracle + anchors + ranking
Stage E   relaxation + 3-ways + out-of-scope           → relaxation-correctness tests
Stage F   cache + incremental re-optimization          → invalidation + latency tests
Stage G   server + ai adapter (NIM + offline)          → server integration + fallback tests
Stage H   web UI (store → Room → Taste → Result →       → UI smoke + render-equality tests
              receipt panel + 2D/3D toggle)
Stage I   export + polish (loading/empty/error,         → final gate + video prep
              demo rails: impossible-brief + 3 ways)

Dependencies: A → B → C → D → E → F are the deterministic core (sequential foundation).
G (AI/adapter) is additive and may run in parallel after A–C. H depends on C/D/E being
functional. I depends on all.
```

---

*End of SYSTEM_ARCHITECTURE.md v1.0. Consistent with `docs/PRD.md`, `docs/OPTIMIZATION_SPEC.md`
and `docs/DECISIONS.md` (ADRs 001–018). Adds no requirements; open numeric values are deferred
to configuration rather than to this document.*