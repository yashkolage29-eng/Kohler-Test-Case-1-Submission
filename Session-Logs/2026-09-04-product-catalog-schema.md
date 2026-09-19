# Session Log — KOHLER AI Bathroom Designer & Planner (Catalog Schema)

**Session type:** Documentation authoring — `docs/PRODUCT_CATALOG_SCHEMA.md`
**Date:** 2026-09-04
**Workspace:** `/Users/yashkolage/Downloads/kolher`
**Sources read first:** `docs/PRODUCT_CATALOG_SCHEMA.md` (empty stub), `docs/PRD.md`,
`docs/SYSTEM_ARCHITECTURE.md`, `docs/OPTIMIZATION_SPEC.md`, `docs/DECISIONS.md` (ADR-008, ADR-012
extracted in full), `tasks/TASKS.md` (did not exist), `.clinerules/AGENTS.md`, `.clinerules/rules.md`
(no root-level `rules.md`/`CLAUDE.md` — AGENTS/rules live in `.clinerules/`)
**Outcome:** Created the authoritative `docs/PRODUCT_CATALOG_SCHEMA.md` (580 lines, v1.0),
appended ADR-019 to `docs/DECISIONS.md`, created `tasks/TASKS.md` (T-001 DONE, T-002/T-003 PENDING).

---

## 1. Objective of this session

Author the previously empty `docs/PRODUCT_CATALOG_SCHEMA.md` as the authoritative data schema and
catalog-architecture spec, reconciling the requirements already fixed across the other
source-of-truth documents. Explicitly an orchestration/authoring task per AGENTS.md §3 (inspect all
sources first, invent nothing): the repo is greenfield (no `packages/` yet), so the schema doc is
the Stage A/B prerequisite per SYSTEM_ARCHITECTURE §17.

## 2. Prior context discovered

- `docs/PRODUCT_CATALOG_SCHEMA.md` was a **0-byte stub**; `tasks/` directory did not exist.
- Requirements were scattered and had to be reconciled from:
  - **PRD §11** — seed field list (`model_id, name, category, fixture_class, dim, finish_options[],
    price, image_ref, geometry_descriptor, feature_tags[], compatibility[]`); 40–80 real-KOHLER
    SKUs; hand-audited compatibility; honesty framing.
  - **PRD §12** — `render = catalog geometry` non-negotiable; procedural primitives
    (toilet = tank+bowl, thermostatic shower = valve+head+stem, vanity = box+top+basin).
  - **SYSTEM_ARCHITECTURE §5.3** — exact `SKU` / `CatalogState` TS interfaces (kept identical);
    `engine/catalog` responsibilities (load, quarantine, compatibility graph, substitutes,
    geometry descriptors).
  - **OPTIMIZATION_SPEC §4/§6/§10/§12/§13** — C7 pair-level compatibility; `u_water`
    (flow/flush data), `u_luxury` (finish family + smart features + brand tier),
    `u_maintenance` (wear resistance + simplicity); quarantine on missing mandatory fields;
    substitute sets for relaxation; determinism/hash.
  - **ADR-008/012** — plain type-checked JSON/TS files, no DB; rule-derived compatibility defaults
    + authoritative curated override graph, consistency-checked at load; quarantine → data-gaps
    surfaced in the receipt.
  - **ADR-017 / SYS-ARCH §17** — Stage-B test gate: quarantine + substitute suites.

## 3. Ambiguities found and resolved (recorded as ADR-019)

The sources fixed the field seed but left six concrete semantics open. Each was resolved in the
schema doc and marked `[ADR-019]`:

1. **Compatibility default rule (C7):** `defaultOk(a,b) = whiteWare(a) ∨ whiteWare(b) ∨
   families(a) ∩ families(b) ≠ ∅`, precedence **veto > force > default**. Chosen-finish harmony is
   a C7 evaluator rule in `engine/rules`, not a graph property. (Alternative rejected: all-pairs
   default with vetoes only — would leave `compatibility[]` force edges semantically empty.)
2. **Mounting** expressed as exactly-one mandatory feature tag (per PRD seed), not a duplicate
   field — prevents drift.
3. **Units:** mm only (≤ 1 dp), INR integer prices; inches derived for display only.
4. **Water metadata** mandatory for faucet/shower/toilet — strengthens OPT §13.4's mandatory list
   so "no 0-gap SKU enters a scored candidate" holds literally for `u_water`.
5. **`priceByFinish`** optional per-finish price overrides (BOM line items carry `finish`).
6. **`u_maintenance` simplicity** derived from primitive count + complexity tags; "brand-tier
   points" = config-weighted `luxuryPoints` + feature bonuses (no separate field).

Key semantic separation established: the compatibility **graph** is finish-agnostic and curated;
finish harmony of *chosen* finishes lives in the rule engine (single authority per OPT §10).

## 4. Artifacts produced

- **`docs/PRODUCT_CATALOG_SCHEMA.md` v1.0** (580 lines): §0 purpose/scope; §1 traceability table;
  §2 storage & file layout; §3 closed vocabularies; §4 finishes table; §5 normative SKU schema +
  per-field validation table; §6 GeometryDescriptor contract (anchor convention, closed per-class
  part vocabulary, bbox-vs-dim check, renderer contract); §7 compatibility model; §8 substitutes;
  §9 load/quarantine pipeline (10 normative steps, fixpoint reference integrity); §10 objective-feed
  contract; §11 determinism & snapshot id; §12 curation targets (50–64 SKUs, per-class feature
  coverage, honesty note); §13 four worked examples (incl. one quarantine case); §14 out of scope;
  §15 Stage-B test gate (8 suites); §16 acceptance criteria; Appendix A normative `schema.ts`.
- **`docs/DECISIONS.md`**: ADR-019 appended (index row + full entry; prior ADRs untouched).
- **`tasks/TASKS.md`** (new): T-001 DONE; T-002 implement `engine/catalog` + Stage-B tests
  (backend-agent, depends T-001); T-003 curate & hand-verify real KOHLER data (product-agent,
  depends T-002).

## 5. Verification performed

- Section-by-section read-back: all 17 sections + appendix present; no leftover authoring markers.
- Interface parity check: `SKU` / `CatalogState` match SYSTEM_ARCHITECTURE §5.3 field-for-field;
  all PRD §11 seed fields present; `LoadReport`/`QuarantineRecord` additive.
- ADR-019 present in both the DECISIONS index and body; DECISIONS footer preserved (append-only
  convention respected).
- TASKS.md written after a directory-race retry (`tasks/` had to be created first).

## 6. Deliberate choices / caveats for the next session

- §13 example model numbers/prices are **illustrative** — the doc itself mandates hand-verification
  against public KOHLER India retail data before the demo (§12, §16.5).
- Water-metadata mandatory rule is a deliberate strengthening of OPT §13.4; reversible in one line
  if the owner prefers worst-anchor fallback.
- Vocabulary closures and the default compat rule are spec-amendment-gated; changing them requires
  a new ADR.

## 7. Next steps

- T-002: implement `packages/engine/src/catalog` (`schema.ts`, `validate.ts`, `graph.ts`,
  `index.ts`) with the Vitest quarantine/substitute/determinism suites — delegate to backend-agent.
- T-003: curate the real KOHLER demo catalog (50–64 SKUs per §12 targets) — delegate to
  product-agent after T-002.

