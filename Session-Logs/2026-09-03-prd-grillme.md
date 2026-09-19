# Session Log — KOHLER AI Bathroom Designer & Planner

**Session type:** Product definition via Grill-me
**Date:** 2026-09-03
**Workspace:** `/Users/yashkolage/Downloads/kolher`
**Outcome:** Created the authoritative `docs/PRD.md` after a structured interrogation.

---

## 1. Objective of this session

Before writing `docs/PRD.md`, run a **Grill-me** interview (one question at a time)
to:

- Expose ambiguity, weak product ideas and unnecessary features.
- Surface technical risks, edge cases, and contradictions.
- Push toward a technically credible, demonstrable MVP.
- Decide what is **deterministic** vs **AI-driven**.
- Identify a strong innovation story that is clearly more than an "AI chatbot."
- Capture a design tree where each decision branches into the decisions that follow.

Per the explicit instruction, **no PRD was written until the user confirmed** the
final summary.

---

## 2. Prior context discovered

Before questioning, I inspected the workspace. Key findings:

- Repo has `.clinerules/AGENTS.md` and a `docs/` directory.
- `docs/PRD.md`, `docs/SYSTEM_ARCHITECTURE.md`, `docs/PRODUCT_CATALOG_SCHEMA.md`,
  `docs/OPTIMIZATION_SPEC.md`, `docs/DECISIONS.md` all existed as **empty stubs**
  (clean slate, no conflicting legacy requirements).
- `AGENTS.md` already asserted the core thesis:
  > "AI proposes and reasons; deterministic systems validate and optimize. The LLM
  > must never be the final authority for physical feasibility, dimensions,
  > compatibility or budget calculations."
- Evaluation weights (given by user): Approach & Innovation 45%, Technical
  Execution 25%, UX & Feasibility 20%, Business & Sustainability 10%.
- Required submission artifacts: functional source code, AI
  system-instruction/workflow PDF, 1–3 min demo video, ≤4-slide deck.

---

## 3. Design tree decisions (settled during the interview)

| # | Decision | Resolved answer |
|---|---|---|
| D1 | Target user | DIY homeowner |
| D2 | Differentiator | Buildable-plans correctness (not a chatbot) |
| D3 | Room input | Photo **seeds**; dimensions **decide**; user confirms preview |
| D4 | Rule engine | Deterministic clearances/door-swing/zones/plumbing + honest framing |
| D5 | AI↔deterministic loop | Solver-first (Y) + AI curate-and-narrate (Z) |
| D6 | Aesthetic | Taste → deterministic feature constraints (T2), not tag filtering |
| D7 | Render | Procedural Three.js 3D + 2D from catalog geometry |
| D8 | Catalog | Curated real-KOHLER ~40–80 SKUs |
| D9 | Optimization | Constraint search + weighted objective + one priority control |
| D10 | Impossible brief | Guided, validated relaxation (Option O), mandatory |
| D11 | AI model | NVIDIA NIM hosted API — Kimi K3; deterministic-first, offline fallback |
| D12 | Jurisdiction | Pune (NBC 2016 / CPWD / local byelaws flavor) |

---

## 4. Question-by-question interview record (the grill)

Entries below show the question asked, the user's answer, and the consequence.

### Q1 — Who is the target user?
**Question:** The phrase "helps customers design a bathroom" is ambiguous between
three personas — DIY homeowner, professional contractor/designer, or KOHLER
internal/sales. Recommending the DIY homeowner as primary, with a note that the
deterministic engine could later serve pros.
**User answer:** Homeowner, and the product should be centered on **buildable plans**.
**Consequence:** The innovation story became "AI proposes; deterministic engineering
### Q2 — How does the room enter, and what role does "image" play?
**Question:** Dimensions-only, sketch, or real-photo parsing? Flagged real-photo →
geometry as the highest demo-risk (bathrooms are cramped/distored with mirrors).
Recommended deferring full photo parsing out of MVP.
**User answer:** "Can we do photo for shape of the room to eliminate the canvas
thing, and keep dimensions as a separate input to stay precise?" — photo for shape,
dimensions for accuracy/scale.

### Q3 — Photo as shape: rectification risk
**Question:** Challenged that "shape from photo" forces a hard homography/CV step,
and that floor outlines are usually plain rectangles anyway. Recommended a
"photo-authorizes-but-never-governs" architecture: photo proposes door/window/
outline, dimensions overwrite for authoritative scale, user confirms the preview.
**User answer:** "Yes, do as you are recommending."
**Consequence:** Locked **D3** — photo seeds, dimensions decide, user confirms.

### Q4 — What does "buildable" concretely mean?
**Question:** Presented a rigor ladder (fit/non-overlap → clearances → openings →
code-level compliance → costed BOM) and pushed for a small documented deterministic
rule set with honest framing, rather than fake "full code compliance."
**User answer:** "Yes do that; and for demo basis use rules that apply to Pune itself."
**Consequence:** Locked **D4** and **D12** — Pune-flavored rule set, planning-level framing.

### Q5 — How do AI and deterministic actually loop?
**Question:** Contrasted "AI then filter" vs "solver-first, AI curates vs AI-narrates"
(Y/Z), and pushed for solver-only-valid + AI curates-from-measured-data.
**User answer:** "Do as recommended."
**Consequence:** Locked **D5** — solver-first (Y) + AI curate-and-narrate (Z).
### Q6 — What does "aesthetic" concretely do?
**Question:** Warned that aesthetic-as-tags would be a "glorified filter." Recommended
T2: AI maps taste → deterministic feature-selection constraints (fixture classes,
finishes, tones) that actually constrain the solver.
**User answer:** "Do as recommended, but I'd like a 3D render it doesn't have to be
photoreal but enough to understand the final room; and use the real KOHLER catalog
if possible."
**Consequence:** Locked **D6** (T2) and introduced the 3D + real-catalog requirements.

### Q7 — What does "real KOHLER catalog" mean?
**Question:** Clarified public data is rich but compatibility data is thin/sparse.
Pushed for a curated ~40–80 real-SKU subset with manual, honestly-labeled
compatibility, and made "render = catalog geometry" non-negotiable.
**User answer:** "Yes do that; also tell me how the 3D render will be done."
**Consequence:** Locked **D8**; I provided a concrete rendering explanation (below).

### (Side note) — How the 3D render is done
I explained 3D rendering concretely:
- **Option 1 — procedural primitive scene-graph (Three.js/WebGL):** catalog stores
  per-SKU geometric descriptors; the renderer deterministically builds the room and
  fixtures from them. Render = catalog geometry by construction. Recommended.
- **Option B — photoreal GLB meshes:** high quality but licensing and fidelity-risk;
  rejected for MVP.
- **Option C — server-side Blender stills:** high framing quality but latency/no
  interactivity; skipped for MVP (kept as stretch hero render).
- Detail: room = extruded polygon; fixtures = parametric primitives sized to catalog
  dims; finishes = material swatches; the "wow" is that list ⇔ layout ⇔ render agree,
  not photorealism.

### Q8 — What does "optimized against multiple objectives" compute?
**Question:** Warned that "fits and sums" isn't real optimization. Recommended a
**single priority control** (value/balance/luxury/eco) that re-weights a scored
objective over a constraint-feasible candidate set; AI narrates why from measured
scores, never votes.
**User answer:** "For the 3D render do as you recommend, and do as recommended for
this as well."
**Consequence:** Locked **D7** (procedural render) and **D9** (priority-steered optimizer).
### Q9 — Behavior when no plan is possible?
**Question:** Presented Option N (hard error) vs Option O (guided, validated
constraint relaxation: diagnose blockers, offer validated trade-offs: drop/shrink
fixture, raise budget, move door/window). Called it the strongest anti-chatbot move
and the most expensive UX/geometry feature.
**User answer:** "Yes that's good."
**Consequence:** Locked **D10** — guided validated relaxation is mandatory.

### Q10 — Actual state of deployable wiring?
**Question:** Asked whether a working prototype already exists and whether the demo
must run fully offline with zero API keys, plus time budget to submission.
**User answer:** "I do not have a working prototype — everything has to be built from
scratch. And I'm planning to use NVIDIA NIM as my API for real reasoning/generation,
but with defined constraints."

### Q11 — NVIDIA NIM reality check (hosted vs self-hosted)
**Question:** Explained NIM ships either self-hosted (needs a big GPU + models) or
as a hosted API (needs network + keys). Recommended a "NIM-optional, always-runnable"
architecture: deterministic engine fully self-contained and offline-capable; AI layer
behind a narrow, swappable interface validated by the deterministic rules; clean
offline fallback. Queried whether authority stays deterministic.
**User answer:** Confirmed expected outcome (optimized product combinations fitting
space+budget, plus 2D/3D) and stated they'd use the **NIM hosted API** with **Kimi K3**.

### (Fact check) — Kimi K3 availability
I verified via the NVIDIA NIM model catalog that **Kimi K3** (`moonshotai/kimi-k3`)
is a real, multimodal (~2.8T MoE, image understanding) model available on NIM's
hosted "Free Endpoint". This validated the user's model choice and confirmed its
vision capability suits photo-seeding.

### Q10/Q11 consequence
Locked **D11** — NIM hosted Kimi K3, deterministic-first, offline fallback. The
deterministic core is the authoritative correctness layer; AI curates/narrates only
within valid candidates.

---

## 5. Key prompts captured from the session

Notable explicit user prompts that shaped the product:

- "a and it should be centered on buildable plans" — set the differentiator.
- "can we do photo for shape ... keep the dimensions as a separate input to keep it
  precise" — established photo-for-shape + dimensions-for-scale.
- "do as recommended for this as well" — ratified the solver-first loop, the
  procedural render, and the priority-steered optimizer.
- "for demo basis use rules that apply to Pune itself" — set the jurisdiction.
- "I would like a 3D render ... enough to understand how the finished room would look
  ... use real KOHLER catalog if possible" — set render + catalog requirements.
- "no working prototype ... everything has to be built from scratch" — confirmed
  greenfield; "will use NVIDIA NIM ... Kimi K3 as my model" — set the AI stack.
---

## 6. Final summary delivered (confirmed by user)

The grill ended with a complete summary of: final product definition, target user,
core user journey, MVP scope, out-of-scope features, key innovations, functional &
non-functional requirements, AI vs deterministic responsibilities, major constraints,
success criteria, demo "wow moment," and key technical risks. The user replied
**"confirm"**, authorizing the write-up.

### Demo wow moment (locked)
Live: hand the tool an impossible brief (tiny room ~5'×6', tub + shower + double
vanity + toilet, meager budget). It does not crash — it returns *"That can't all fit
here — here are 3 ways that do"* → user picks one → a fully buildable, validated,
costed plan with a 3D room whose fixtures exactly match the BOM.

---

## 7. Deliverable produced

- **`docs/PRD.md`** — created (407 lines) as the authoritative product spec,
  replacing the empty stub. Sections: document control, elevator summary, background,
  goal/non-goals, definitions, target user, user journey, system architecture,
  AI-vs-deterministic split, rule set, catalog & compatibility, 2D/3D
  representation, optimization & priority, UI, non-functional requirements, success
  criteria, wow moment, AI layer details, decision log, backlog, MVP boundary.

---

## 8. Next steps

- Fill remaining empty specs (`SYSTEM_ARCHITECTURE.md`, `OPTIMIZATION_SPEC.md`,
  `PRODUCT_CATALOG_SCHEMA.md`, `DECISIONS.md`) to align with the PRD.
- Plan implementation tasks in `tasks/TASKS.md`.
- Begin with the deterministic core: rule engine + catalog + feasibility search,
  before the AI and rendering layers.

---

*End of session log.*
guarantees a buildable plan," not visual design wizardry.