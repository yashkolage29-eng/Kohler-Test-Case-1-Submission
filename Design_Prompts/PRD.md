# KOHLER AI Bathroom Designer & Planner — Product Requirements Document (PRD)

> **Document status:** Authoritative product specification for implementation.
> A development agent must be able to implement to this document without guessing.
> Any ambiguity not resolved here is either intentionally deferred (see Out of Scope) or a bug in this document.
>
> **Source:** Produced from a structured Grill-me design session with the product owner.

---

## 1. Document control

| Field | Value |
|---|---|
| Product | KOHLER AI Bathroom Designer & Planner |
| Status | Approved MVP spec (implementation baseline) |
| Core thesis | **AI proposes, reasons and explains; deterministic systems guarantee buildability.** |
| Demo jurisdiction | Pune, India (planning‑level; inspired by NBC 2016 / CPWD / local byelaws) |
| Submission deliverables | Functional source code, AI system‑instruction PDF, 1–3 min demo video, ≤4‑slide deck |
| Prototype state | **Greenfield — no existing prototype; build from scratch** |

---

## 2. Elevator summary

A homeowner describes or photographs their bathroom, states a budget and an aesthetic, and the
system deterministically produces **physically valid, code‑flavored KOHLER product combinations**, a
costed bill of materials, and an honest **3D/2D representation** of the finished room. The AI layer
interprets taste, narrates reasoning, and suggests from *within* a provably valid candidate set — it
never decrees feasibility, geometry, compatibility, or cost.

The product deliberately is **not** a "product recommendation chatbot": the deterministic engine is
the sole authority for correctness, and every output that faces the user is guaranteed‑valid.

---

## 3. Background & problem

Homeowners remodeling a bathroom face three interlocking challenges:
1. **Spatial uncertainty** — most people cannot translate "a 6'×8' guest bath" into a buildable
   layout; few know the fixtures physically fit with usable clearances and door swings.
2. **Constraint chaos** — budget, taste, space, and real plumbing/clearance rules pull in opposite
   directions; there is no single place a non‑expert can hold them together.
3. **Zero confident alternative** — the web offers inspiration (Pinterest) or one product at a
   time from a catalog, but nothing that assembles a *valid combination* against *their room*.

The product directly answers this: it holds the room, budget, and taste together and always
returns a **buildable** plan rather than a suggestion.
---
## 4. Goal and non‑goals

### Goal
Deliver a demo that deterministically assembles buildable, cost‑conscious KOHLER bathroom
configurations for a real room, and represents the result honestly in 2D + 3D — convincingly enough
that a reviewer concludes "this is an intelligent planner, not a chatbot."

### Non‑goals (explicitly out of scope now)
Full‑fidelity photo‑to‑CAD; photoreal product meshes; AI as final authority on any rule; complete
legal/local code certification; full real‑world KOH catalog; multi‑user/save/login; AR/mobile apps;
live e‑commerce; public hosting.

---

## 5. Definitions & terms

- **Plan**: the validated, buildable arrangement (geometry + fixtures + cost) for one room.
- **Candidate**: one specific combination/placement instance produced by the solver.
- **Valid**: a candidate that passes the deterministic feasibility + rule layer (§10).
- **Rule set**: the concrete, documented deterministic clearance/code rules (Pune‑flavored, §10.3).
- **Curated catalog**: the demo‑scope KOHLER product subset (real model numbers, §11).
- **Priority control**: the single user steering gesture for the optimization objective (§13).
- **BOM**: bill of materials — model list with quantities, finishes, prices, total.
- **AI**, **deterministic solver**, **validator**: the three named subsystems (§9).

**Authoritative‑vs‑advisory split (the load‑bearing rule):**

| Concern | Authority |
|---|---|
| Feasibility, clearance, geometry, compatibility | **Deterministic only** |
| Budget / cost sums | **Deterministic only** |
| Physical placement correctness | **Deterministic only** |
| Aesthetic choice, taste interpretation, narration, explanation | AI (within valid set) |

The AI (NIM / Kimi K3) **never** overrides any deterministic contract. Its output is always
checked/constrained by the validator before it surfaces.

---

## 6. Target user & scenario

**Primary persona — the DIY homeowner**
- Has a vague but real idea ("I want a modern, spacious‑feeling guest bath").
- Has real constraints: room dimensions, a budget (typically ₹3–6L for demo‑scale remodel),
  and a tolerance for construction/plumbing impact.
- Is **not** a construction/production professional; needs a plan a contractor can price.
- Values **confidence** that "it will actually fit and work" over a pretty picture that lies.

**Persona‑specific insight used by the product:** the recommendation is credible to this user only
if it survives "does it fit, cost what I said, and can a professional build it." That is the entire
differentiating claim.

**Future persona (out of scope):** remodel contractors, interior designers, KOHLER trade
showroom selling, dealers.

---

## 7. User journey (MVP)

### 7.1 Step 01 — Add the room
- User uploads a photo of the room **and** types authoritative dimensions.
- AI (Kimi K3 vision) returns **proposal‑only** estimates: door location(s), window location(s),
  opening/rough‑in cues, and a **mutable draft wall outline**.
- User types the **authoritative dimensions** (e.g., 6'8" × 8').
- System renders a **plan preview** (editable: drag door/window, adjust wall).
- **User confirms the preview.** This confirmation is the gate: after it, the deterministic engine
  works only on clean, authoritative polygon + openings.

**Room free‑hand fallback (no photo):** user draws / enters a wall‑scaled rectangle/L‑shape
directly; same authoritative‑dimension + preview‑confirm flow.

### 7.2 Step 02 — The taste + priority
1. User states taste in plain language ("modern, spa, low‑maintenance, mid‑budget").
2. **AI maps taste → deterministic feature constraints** (not tag‑labels): fixture classes
   (e.g., no tub vs soaking tub; freestanding vs built‑in; rain shower count; toilet flush type;
   vanity style; finishes/material family; tone/exchange target).
3. Priority control set (value → balance → luxury → eco/low‑maintenance, §11). This is the
   steering knob for the optimizer.

### 7.3 Step 03 — Generate the plan
1. Deterministic solver enumerates **valid candidates** (feasible geometry) and ranks by weighted
   objective.
2. AI narrates **why** the winning plan fits, from measured scores (not vibe).
3. Outputs: buildable layout, costed BOM / model list, budget summary, 2D/3D procedural render.

### 7.4 Step 04 — Explore & steer
- Change the priority / budget / a fixture / move the door → same pipeline re‑runs; every re‑roll
  re‑passes validation. AI explains the delta in measured terms.

### 7.5 Step 05 — Impossible brief → guided relaxation (mandatory)
- If no valid candidate exists, the solver **diagnoses the blocker(s)** and returns a **ranked menu
  of provably‑valid relaxation paths** (substitute/changed fixture, shrink fixture, raise budget,
  move a door/window constraint). AI narrates the measured trade‑offs.
- User picks one → pipeline re‑runs within the new valid space.
- Only if even the relaxed space is empty: honest "beyond this demo's scope" state.
  **No fake plan, no crash, no silent best‑effort.**

### 7.6 Step 06 — Take it away
Export: clean BOM (model #s), 2D layout PNG, 3D scene (walkable), total cost.
(Future: send‑to‑contractor / dealer‑lead — out of scope.)

---

## 8. System architecture (high‑level)

Three‑layer system. The split between layers is the load‑bearing design decision.

```
 User input
   │
   ▼
┌─────────────────────────┐
│   AI LAYER (NIM)          │  taste→features, photo proposal, narration,
│   Kimi K3 hosted API       │  trade‑off explanations.      ONLY within valid set.
│  (cached / offline        │
│   fallback)               │
└──────────┬──────────────┘
           │ (feature restrictions, free text, preference)
           ▼
┌─────────────────────────┐
│  DETERMINISTIC CORE       │  ← the ONLY authority for correctness.
│  · room geometry           │
│  · rule / feasibility      │   ・ fixture selection (feasibility search)
│  · weighted objective      │   ・ candidate generation & ranking
│  · cost / inventory        │   ・ relaxation diagnostics
│  (fully self‑contained,    │
│   offline)                 │
└──────────┬──────────────┘
           │ (valid plan)
           ▼
┌─────────────────────────┐
│  PRESENTATION LAYER       │
│  · 2D layout render        │   · 3D procedural render (Three.js, catalog geometry)
│  · BOM / pricing           │   · AI narration on the valid plan
└─────────────────────────┘
```

**Key structural consequence:** an invalid plan never exists as an artifact. The AI can only
select/explain/curate from the valid set the deterministic solver emits. That is what makes the
product a *planner*, not a chatbot.

**Rules the AI must never decide:** feasibility, clearance, geometry, compatibility, budget.
---

## 9. Responsibilities split (AI vs Deterministic)

### 9.1 AI responsibilities (NIM / Kimi K3)
1. Interpret taste/free‑text into deterministic **feature constraints**.
2. Photo → door/window/opening/outline **proposals** (vision; proposal‑only, not authoritative).
3. Narrate why a plan fits; explain measured trade‑offs in plain language.
4. Help present the relaxation menu (rank/validate options the solver emits).
5. Optionally generate honestly‑labeled inspirational mood content (non‑binding).

### 9.2 Deterministic system responsibilities (always‑on, offline)
1. Clean‑input pre‑processing: confirm authoritative polygon; normalize it.
2. All clearance / door‑swing / code‑flavor rules (§10).
3. Fixture‑to‑fixture compatibility graph (manually curated, honestly staged, §11).
4. Feasibility search over constraints & geometry; candidate generation.
5. Weighted‑objective ranking + priority re‑weighting.
6. Inventory / cost math; budget enforcement.
7. Relaxation diagnostics: which constraint killed it; provably‑valid alternatives.
8. Render geometry source = catalog geometry (renderer never invents geometry).

---

## 10. Deterministic rule set (feasibility & legality flavor)

A **small, explicit, documented** rule set is the *validator* and the "why" shown to the user.
Must be realistically implementable and reviewable. Rules are framed as:

> "Planning‑level, inspired by common Pune / NBC 2016 / CPWD best practice. Always verify with a
> licensed professional; this is not a final code certificate."

### 10.1 Normative scope (target ~25–40 rules)
- **Fit:** fixture footprints within room polygon; no wedge/overlap between fixtures.
- **Clearances:** minimum working/access clearance per fixture class (e.g., toilet front/side,
  sink in front, shower entry, tub side) — values in a single config file.
- **Door swing:** door fixture arcs must not collide with fixtures / walls / other swings.
- **Fixture zones:** allotted footprint kept (toilet zone, vanity zone, shower zone, tub zone).
- **Plumbing‑min:** reasonable minimum distances between fixture connections / openings / rough‑ins
  (common Pune / CPWD / NBC plumbing‑guideline flavor).
- **Layout sanity:** a door cannot open into a fixture clearance, etc.

### 10.2 Configurable & documented
Each rule lives in one config/file per rule with: name, condition, value, and a human‑readable
explanation used by the AI narration ("Keep ~24" clearance in front of the toilet" ).

### 10.3 Jurisdiction
Demo data shaped for **Pune** (NBC 2016 / CPWD / local byelaws flavor). Only the demo subset —
not full legal certification. Label the demo "planning‑level, subject to local code."

### 10.4 Traceability
Solver must answer "why is this valid" from the fired rule (which rule, which values). This feeds
both the narration and the relaxation diagnostics.

---

## 11. Catalog & compatibility (real KOHLER catalog)

| Concern | Decision |
|---|---|
| Scale | **Curated ~40–80 real‑KOHLER SKUs** spanning fixture classes (toilets, basins, faucets, smart toilets, thermostatic showers, vanities, tubs, accessories) |
| Build | Real model numbers, list prices, finishes, dimensions, images where available |
| Source | Public web/retail KOHLER data, verified by hand for correctness |
| Compatibility | **Manually‑audited compatibility map**, honestly labeled `planning‑level, verify with KOHLER trade data` |
| Render source | Every SKU carries a **geometric descriptor + finish/material maps**; the procedural 3D render is built from these (§12) |
| Licensing | Demo‑subset inspired by public data; full‑catalog integration is a future integration |
| Pricing | Real (list) prices; an honest total including planned add‑ons/estimates for demo |

### Catalog schema (implementation seed)
`model_id, name, category, fixture_class, dimW×D×H (mm/in), finish_options[], price,
image_ref, geometry_descriptor, feature_tags[] (smart, low‑flow, floor‑mount, freestanding…),
compatibility[] (manually curated IDs)`.

---

## 12. 2D / 3D representation

**Rule (non‑negotiable): `render = catalog geometry`. The 3D can never disagree with the plan or
the BOM — by construction.**

### 12.1 2D
Top‑down dimension‑annotated floor plan: room polygon + wall thickness + door/window placement +
fixture footprints + clearance / door‑swing overlays + dims.

### 12.2 3D (procedural, three.js / WebGL)
- **Deterministic scene‑graph builder**, not photoreal assets.
- Room: extruded box from the authoritative polygon to wall height; floor/walls/tile by category.
- Fixtures: reconstructed from the catalog `geometry_descriptor` as clean primitives (e.g., toilet =
  tank+bowl, thermostatic shower = valve+head+stem, vanity = box+top+basin) sized to exact
  catalog dimensions, placed at the solver's positions.
- Finishes: mapped to material/color swatches (brushed‑nickel, matte‑black, white‑stone…).
- Orbit / walk‑around camera.
- **Fidelity vs realism:** "list ⇔ layout ⇔ render agree" is the wow; not photorealism.

### 12.3 Stretch (out of MVP)
A single polished labeled "hero still" from a Blender frame for the deck/video; optional
non‑binding moodboard image as "inspiration, not exact."
---

## 13. Optimization & the priority control

- **Objective:** pick, among **valid candidates**, the one maximizing the weighted objective sum
  for the chosen priority.
- **Priorities (the one control):** `value / balance / luxury / eco‑low‑maintenance` — a
  deterministic re‑weight of objective terms: fit‑margin, maintenance/longevity compatibility
  score, cost, ecological/water efficiency, luxury/finish premium score, etc.
- **Mechanism (two deterministic stages):**
  1. **Feasibility search** over curated catalog × placement valid space (run once, cached).
  2. **Weighted‑objective ranking** picks the best valid candidate to become the plan.
- **AI role:** narrate *why* this is best for the selected priority, from measured scores; never
  adds a vote to the objective.
- **Bound:** catalog is small (~40–80) so the combinatorial space is bounded; search once, then
  re‑score only on constraint change.

---

## 14. User interface (high level)

### Front‑end screen flow (single app)
1. **Room** — upload photo; dims entry; preview; confirm (also rectangle/L‑shape + dims fallback).
2. **Taste** — free text → feature chips; priority slider.
3. **Result** — plan; BOM; price; 2D and 3D tabs; "why" narration.
4. **Adjust & re‑roll** — change priority/budget/fixture; regenerate; relaxation menu on failure.
5. **Export** — BOM / layout / (3D scene), total cost.

### UX principles
- The deterministic "why it's valid" is always one click away (rules surfaced, not hidden).
- Load the demo as "buildability‑first" intelligence; every claim auditable.
- Impeccable/Materials‑style: cover loading, empty and error states; responsive layout.

---

## 15. Non‑functional & run‑ability requirements

| # | Requirement |
|---|---|
| N1 | **Demo must run with zero network/API‑key guarantee for the core loop** (deterministic engine fully local; LLM surface optional; cached/rule‑based offline fallback keeps app usable without NIM) |
| N2 | Deterministic engine self‑contained; no GPU, no external model files; `npm install && run` |
| N3 | Regenerate latency ≤ ~2 s for typical briefs (cached search) |
| N4 | Deterministic & reproducible outputs (same input → same plan; no hidden randomness) |
| N5 | Render complexity bounded (procedural, not photoreal) for in‑room feasibility |
| N6 | Honesty framing: planning‑level rules, curated catalog, not‑certificate disclaimer |

---

## 16. Success criteria (definition of done, demo‑oriented)

1. Generates a **valid, costed, code‑flavored plan** for a typical brief (room + style + priority).
2. Every plan / re‑roll / relaxation **passes the deterministic validator** (no invalid output).
3. Budget & clearance outputs are **correct, reproducible and explainable** (rules surfaced).
4. **3D matches its BOM** (render = catalog geometry) — audit‑clean.
5. Runs on a judge‑grade machine **with or without network (no keys required)**.
6. Completes the 4 deliverables within budget (source, AI‑prompt PDF, video, deck).
7. Reviewer honestly concludes **"planner, not chatbot"**; alive impossible‑brief flow.

---

## 17. Demo "wow" moment (planned)

Hand the tool an **impossible brief live**: tiny room (~5'×6'), tub + shower + double vanity +
toilet, meager budget → it does **not** crash. It shows: *"That can't all fit here — here are 3
ways that do."* → user picks one → a fully buildable (validated), code‑flavored, costed plan
appears, with a 3D room whose fixtures are **exactly the BOM**. The classic kill‑question is
converted into the demo's strongest story.

---

## 18. AI layer details

- **Primary model:** **NVIDIA NIM hosted API — Kimi K3** (`moonshotai/kimi-k3`), multimodal
  (text + image), ~2.8T MoE, available on build.nvidia.com; verified usable by this spec.
- **Roles via Kimi:** taste→features, photo→proposals (vision), narration/explanation, trade‑off
  language.
- **Hard constraint:** every AI *proposal* (feature restrictions, placement, narration) is
  validated/constrained; the AI cannot emit an unvalidated final plan.
- **Offline path:** a rule‑based local narration + cached illustrative outputs degrade gracefully.

---

## 19. Decision log (Grill-me output)

| # | Decision | Status |
|---|---|---|
| D1 | Primary persona = DIY homeowner | Decided |
| D2 | Buildable‑plans correctness = differentiator | Decided |
| D3 | Photo seeds; dimensions decide; user confirms | Decided |
| D4 | Deterministic rule engine (clearances, swing, zones, plumbing) + honest framing | Decided |
| D5 | Loop: solver‑first (Y) + AI curate‑and‑narrate (Z) | Decided |
| D6 | Taste = feature‑selection mapping (T2), not tags | Decided |
| D7 | Render: procedural three.js 3D + 2D from catalog geometry | Decided |
| D8 | Catalog: curated real‑KOHLER ~40–80 SKUs | Decided |
| D9 | Optimization: constraint search + weighted objective + 1 priority | Decided |
| D10 | Impossible‑brief: guided validated relaxation (Option O) mandatory | Decided |
| D11 | AI: NIM hosted Kimi K3; deterministic‑first, offline fallback | Decided |
| D12 | Pune‑flavor jurisdiction for demo | Decided |

---

## 20. Future / out‑of‑scope (backlog)

Full‑catalog / trade integration; pro persona; certification engine; real‑commerce; AR
walkthrough; saved projects & login; mobile apps; dealer‑lead handoff.

---

## 21. MVP boundary

**In:** room entry (photo + dims, confirm), taste→features, rule engine, feasibility search,
validation, BOM/cost, priority re‑weight, offline fallback, relaxation flow, 2D + 3D render,
narration (NIM + offline fallback), local run (no keys), all 4 deliverables.

**Out:** photoreal product meshes, full catalog, e‑commerce, AR, cert‑grade rules, multi‑user,
public deployment.

---

*End of PRD v1.0. Authoritative spec for implementation.*
