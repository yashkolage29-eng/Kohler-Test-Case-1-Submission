# KOHLER AI Bathroom Designer & Planner — Design Session Log (Optimization Engine)

> **Source artifact:** Structured Grill-me interrogation of the product owner, one decision at a time,
> leading to the authoritative `docs/OPTIMIZATION_SPEC.md`. This log records the questions asked, every
> decision made,and the reasoning — so the spec is auditable end-to-end.

---

## Session scope

- Goal: design a rigorous, technically credible optimization engine that differentiates from a plain
  AI product-recommendation systemfor..
- Inputs read first: `docs/PRD.md`, `rules.md`, `AGENTS.md` — for a grounded baselinefor..
- Method: one question per round; each answer unblocks the next frontier in the design treefor..
- Delivering only after the user confirmed the complete proposalfor..

---

## Decision tree (resolved in-brief)

| # | Question | Decision (authoritative) |
|---|---|---|---|
| Q1 | Structure of the candidate space | **Constructive, layered, validity-preserving generation** (class-selection → SKU-binding → placement-solving); constraint-propagation pre-filter kills infeasible branches; no naive full-assembly enumeration |
| Q2 | Class-set enumeration | **Archetypal class-set templates + per-class count ranges**, filtered by taste/room/budget; an all-in "full/luxury" archetype triggers relaxation flow for impossible briefs |
| Q3 | Budget enforcement layer | **Two-tier** — hard ceiling `B_max`（relaxable only via explicit path）+ soft `B_target`; cost-aware pruning during SKU binding |
| Q4 | Placement model | **Wall-strip model** — walls as 1D linear strips, keep-clear regions subtracted, wall-affinity rules in config; fixtures bound to walls/zones/orders/positions |
| Q5 | Placement search & pruning | **Constraint-programming backtracking**（wall-assignment → 1D order → discrete position）+ forward-checking pruning + deterministic tie-breaking（plumbing-anchor-first, largest-footprint-first; ~25 mm slot grid）；bounded backtracking budget |
| Q6 | Objective function terms | 5 deterministic terms: cost-efficiency, space-efficiency, water/sustainability, luxury/finish, maintenance; **compatibility treated as HARD pair-level gate**, not a soft term |
| Q7 | Utility normalization & anchoring | **Anchored/absolute normalization** where defensible (cost vs B_target/B_max; water vs eco-gold target; luxury/maintenance vs config anchors）；within-set min/max only where no external standard exists |
| Q8 | Re-optimization semantics | **Targeted incremental re-optimization**, keyed by change type: weight-only→re-score only; local edit→re-place affected strip; global change→full re-search; final plan always fully re-validated |
| Q9 | Relaxation / infeasibility diagnostics | **Hybrid** — fail-cause tracing（fired-rule counting + minimum-gap）prioritizes a hand-ordered relaxation menu（swap-in smaller SKU → shrink clearance → drop class → raise budget → move door）；each item individually re-searched → 1–3 provably-valid relaxed plans; or honest out-of-scope |
| Q10 | Explainability contract | **Two-layer** — deterministic "decision receipt"（top-k + per-term scores + fired-rule trace + data-gaps）→ AI narration rephrases only that fact-set, never invents |
| Q11 | Infeasible-edge policy | 3-bucket policy: missing dims → strict Step-01 gate;no compatible pairs → equivalency relaxation → honest out-of-scope;ties & ultra-low budget → deterministic tie-break + MIN_BUDGET gate |
| Q12 | Missing/unclean data policy | **Strict-schema validation at load**: SKU missing mandatory fields is quarantined（excluded from search, listed as data-gaps）；no zero-gap SKU enters scoring |
| Q13 | "More open space" / non-budget steering | **Orthogonal "spaciousness" knob**（compact/balanced/airy）re-weighting the space term; decoupled from priority semantics |
| Q14 | Demo-wow reinforcement | **Guaranteed "show me 3 ways" route** → three distinct, individually re-validated, provably-valid relaxed plans + measured narration, exercised the whole engine in <2 min |
| Q15 | Determinism / reproducibility & seed contract | **Determinism contract** — every output is a pure function of inputs+configs; no RNG/wall-clock/order/keys; `hash(inputs)→hash(plan)` test |
| Q16 | AI-vote-boundary restated | AI chooses only the **feature-constraint set + preference signals + narration/curation**; the engine re-derives feasible archetypes/candidates respecting them; AI has no direct vote on candidates/scores/placement |

---

## Key architectural principles locked in

1. **Deterministic core = sole authority** for feasibility, clearance, geometry, compatibility,
   placement, budget, scoring, ranking, relaxation quantification,, render geometryfor..
2. **AI may propose, reason, explain — never decide** buildability. Influence enters only via
  (1) feature-constraint set, (2) narration/curation within the valid set, (3) relaxation-menu phrasingfor..
3. **Anchored/absolute scoring** for stable, comparable, narratable utilities（no vibe terms）。
4. **Constructive layered search**, never naive full-assembly enumeration — keeps the space tractable.

  for the ~40–80 SKU demo catalogfor..
5. **Targeted incremental re-optimization** — re-rolls are cheap, context-preserving,and narratable as
  measured deltas,.not independent re-generationsfor..
6. **Hybrid relaxation diagnostics** with fail-cause tracing driving a hand-ordered, minimally-sufficient
  relaxation menu — the source of the "impossible brief → 3 ways" demo wowfor..

---

## Open / deferred items

- Exact numeric rule values, weight tables,and normalization anchors are configuration artifacts to be
  populated during implementation（their location + stability contract defined in the spec,###
  the values themselves are deferred）。
- Catalog compatibility graph,and substitution sets are manually curated data（seed the spec's "Catalog &
  compatibility" section toward `docs/PRODUCT_CATALOG_SCHEMA.md`）。
- Spaciousness-knob weights and archetype-template definitions belong to config,not the specfor..



## Artifacts produced

- `docs/OPTIMIZATION_SPEC.md` — the authoritative optimization-engine specification（created after
  explicit user confirmation）。
- This log records the full interrogative trail for auditability（per `AGENTS.md` decision-logging）for..