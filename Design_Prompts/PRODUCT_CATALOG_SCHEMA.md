# KOHLER AI Bathroom Designer & Planner — Product Catalog Schema

> **Document status:** Authoritative data schema and catalog-architecture specification for the
> curated demo catalog. A development agent must be able to implement the catalog module and author
> catalog data against this document without guessing. Any ambiguity not resolved here is either
> intentionally deferred (§14) or a bug in this document.
>
> **Source:** Concretises `docs/PRD.md` §11–§12, `docs/SYSTEM_ARCHITECTURE.md` §5.3,
> `docs/OPTIMIZATION_SPEC.md` §4/§6/§10/§12/§13 and ADR-008/012/017 in `docs/DECISIONS.md`.
> Schema-level decisions not fixed by those documents are recorded in ADR-019. Adds no requirements.

---

## 0. Purpose & scope

Defines the **curated KOHLER demo catalog**: storage format, closed vocabularies, the normative
`SKU` record schema, the `GeometryDescriptor` contract behind `render = catalog geometry` (PRD §12),
the compatibility override graph behind hard rule **C7**, substitution sets for the relaxation
engine, the load-time validation & quarantine pipeline, and the objective-feed metadata consumed by
the anchored utilities (OPT §6).

Scope: **40–80 curated real-KOHLER SKUs**, single-session, offline, file-based (ADR-008/012).
Out of scope: full catalog, databases, e-commerce, per-finish imagery, live pricing (§14).

## 1. Traceability — normative references

| Concern | Fixed by |
|---|---|
| Catalog scale, classes, honesty framing | PRD §11 |
| Seed field list (`model_id … compatibility[]`) | PRD §11 (implementation seed) |
| `render = catalog geometry` (non-negotiable) | PRD §12 |
| `SKU` / `CatalogState` interfaces | SYSTEM_ARCHITECTURE §5.3 |
| C7 — pair-level compatibility + feature-constraint match | OPTIMIZATION_SPEC §4 |
| `u_water` / `u_luxury` / `u_maintenance` inputs | OPTIMIZATION_SPEC §6 |
| Quarantine on missing mandatory field; data-gaps surfaced | OPTIMIZATION_SPEC §13.4, §12; ADR-008 |
| Storage: plain type-checked JSON/TS files; no DB | ADR-008, ADR-012 |
| Relaxation substitute sets | OPTIMIZATION_SPEC §11; ADR-015 |
| Stage-B tests: quarantine + substitutes | ADR-017; SYSTEM_ARCHITECTURE §17 |
| Determinism / hash stability | OPTIMIZATION_SPEC §14 |

Where this document must choose a value the sources leave open, the choice is marked
**[ADR-019]** and justified in `docs/DECISIONS.md`.

## 2. Storage format & file layout

**[ADR-008/012]** The catalog is plain, type-checked **TypeScript literal modules** under
`packages/engine/src/catalog/`, loaded once at startup by `loadCatalog()` into an immutable
`CatalogState`. No database, no network, no persistence. TS literals (not `.json`) give
compile-time checking with zero runtime dependencies; **compile-time types do not replace
load-time validation** — authoring errors the compiler cannot see must still quarantine (OPT §13.4).

```
packages/engine/src/catalog/
├── schema.ts            # normative types + enums (§3–§6, Appendix A)
├── validate.ts          # load-time validation + quarantine pipeline (§9)
├── graph.ts             # compatibility graph + substitutes construction (§7, §8)
├── index.ts             # loadCatalog(): CatalogState + LoadReport
└── data/
    ├── catalog_meta.ts  # version, honesty note, jurisdiction (§12)
    ├── finishes.ts      # Finish[] (§4)
    ├── toilets.ts  basins.ts  faucets.ts  showers.ts
    ├── tubs.ts     vanities.ts  accessories.ts
    └── compat_overrides.ts  # vetoes (§7.3)
```

### 2.1 Units & scalar formats **[ADR-019]**
- **Millimetres only**, stored as `number`, max one decimal place. Inch values are never stored;
  inch display is derived at the presentation layer (`mm / 25.4`, 1 dp). One canonical unit keeps
  geometry, hashing and rendering deterministic.
- **Prices are INR integers** (list price, `price ≥ 1`); zero/negative/fractional → quarantine.
- All ids are the exact KOHLER model-number string (e.g. `K-3889-0`), case-preserved, unique.

## 3. Closed vocabularies

Vocabulary values are **closed sets**. Adding/removing a value is a spec amendment recorded in
`docs/DECISIONS.md`. Rationale: load-time validation, C7 feature-constraint matching, and anchored
scoring all require enumerable domains; free-form strings would silently break determinism.

### 3.1 `FixtureClass` — 7 values (SYSTEM_ARCHITECTURE §5.2)
`"toilet" | "basin" | "faucet" | "shower" | "tub" | "vanity" | "accessory"`

"Smart toilets" and "thermostatic showers" (PRD §11) are **not** classes: they are `toilet`/`shower`
SKUs carrying the `smart` / `thermostatic` feature tags.

### 3.2 `FinishFamily` — closed set
`"white" | "chrome" | "brushed_nickel" | "matte_black" | "brushed_gold" | "stone"`

### 3.3 `FeatureTag` — closed set (18)
`smart, bidet, heated_seat, self_cleaning, dual_flush, low_flow, rain_shower, thermostatic,
touchless, single_lever, floor_mount, wall_mount, deck_mount, freestanding, comfort_height,
elongated, overflow_none, soft_close`

**Mounting rule [ADR-019]:** every SKU carries **exactly one** mounting tag
(`floor_mount | wall_mount | deck_mount | freestanding`). Mounting is expressed as a feature tag —
per the PRD §11 seed, which lists floor-mount as a tag — and **not** as a duplicate field, so the
two cannot drift. Missing or multiple mounting tags → quarantine (`BAD_MOUNTING`).
Placement consequences of mounting (e.g. wall-mount needs a carrier wall) live in `engine/rules`
config — the catalog stays descriptive, the rules stay decisive.

### 3.4 `QuarantineReason` — closed set
`MISSING_FIELD | BAD_TYPE | BAD_ENUM | BAD_NUMBER | DUPLICATE_ID | BAD_MOUNTING | BAD_WATER_META |
DANGLING_REF | SELF_REFERENCE | BAD_SUBSTITUTE | GEOMETRY_BBOX_MISMATCH | UNKNOWN_FINISH`

### 3.5 Display `category` — closed set, mapped from `fixture_class`
`"Toilets" | "Smart Toilets" | "Basins" | "Faucets" | "Showers" | "Tubs" | "Vanities" | "Accessories"`
Validation: category must match `fixture_class` via the mapping table in `schema.ts`;
`"Smart Toilets"` is valid only for class `toilet` carrying the `smart` tag.

## 4. Finishes table

Finishes are first-class catalog rows (not per-SKU free text) because `u_luxury`, `u_maintenance`
and the procedural 3D material mapping (PRD §12.2) consume their properties.

```ts
interface Finish {
  id: string;              // FinishId — closed, snake_case
  label: string;           // display, e.g. "Brushed Nickel"
  family: FinishFamily;    // harmony rule (§7.2) + u_luxury (§10)
  luxuryPoints: 1 | 2 | 3;           // u_luxury input, anchored in engine config (OPT §6/§7)
  wearResistance: 1 | 2 | 3 | 4 | 5; // u_maintenance input (OPT §6)
  swatchHex: string;       // "#RRGGBB" — procedural 3D material color (PRD §12.2)
}
```

Seed set (values illustrative; finalize at curation, §12):

| id | family | luxury | wear | swatch |
|---|---|---|---|---|
| white | white | 1 | 4 | `#F6F7F8` |
| chrome | chrome | 2 | 5 | `#C9D1D4` |
| brushed_nickel | brushed_nickel | 3 | 4 | `#A9AFB3` |
| matte_black | matte_black | 3 | 3 | `#23272A` |
| brushed_gold | brushed_gold | 3 | 3 | `#C8A96A` |
| white_stone | stone | 3 | 4 | `#E8E6E1` |

Rules:
- `SKU.finish_options[]` references finish ids; an unknown id → quarantine (`UNKNOWN_FINISH`);
  empty/missing `finish_options` → quarantine (`MISSING_FIELD`) **[ADR-019]** — the PRD §11 seed
  lists it as a schema field, and §7's default rule makes it load-bearing for C7.

## 5. SKU record schema (normative)

```ts
interface DimMm { w: number; d: number; h: number }   // mm, > 0, each ≤ 2500

interface WaterMeta {
  flowRateLpm?: number;        // faucet, shower: > 0, ≤ 1 decimal
  flushLiters?: number;        // toilet: full-flush (effective), > 0
  flushLightLiters?: number;   // toilet: optional, only with dualFlush
  dualFlush?: boolean;
}

interface SKU {
  model_id: string;                  // unique, exact KOHLER model number
  name: string;                      // display name
  category: string;                  // closed set (§3.5)
  fixture_class: FixtureClass;       // closed enum (§3.1)
  dim: DimMm;                        // bounding box of the product (checked vs §6.3)
  finish_options: string[];          // Finish ids, non-empty, sorted-unique at load
  price: number;                     // INR base list price
  priceByFinish?: Record<string, number>; // optional per-finish override, INR
  image_ref?: string;                // optional, display-only (never used by render)
  geometry_descriptor: GeometryDescriptor; // §6 — mandatory
  water?: WaterMeta;                 // mandatory for faucet/shower/toilet (§5.1)
  feature_tags: string[];            // closed set (§3.3), sorted-unique at load
  compatibility: string[];           // force-compatible model ids (§7); may be []
  substitutionIds?: string[];        // relaxation swap candidates (§8)
}
```

Correspondence to the seed (PRD §11) and SYSTEM_ARCHITECTURE §5.3: all seed fields are present;
`priceByFinish` is additive **[ADR-019]** — BOM line items carry a `finish`, and the same faucet
in matte black vs chrome can legitimately carry different list prices; where absent, `price`
applies to every finish in `finish_options`.

### 5.1 Water metadata mandatory for "wet" classes **[ADR-019]**
- `faucet`, `shower` → `flowRateLpm` required.
- `toilet` → `flushLiters` required (`dualFlush` SKUs also give `flushLightLiters`; `u_water`
  consumes the full-flush value — conservative and deterministic, OPT §6.3).
- All other classes → no water metadata.
Missing required water data → quarantine (`BAD_WATER_META`). This strengthens OPT §13.4's mandatory
list (size, class, price, geometry, compat list) so the "no 0-gap SKU enters a scored candidate"
guarantee holds literally for every objective term. `u_water`'s eco-gold target and the
worst-catalog anchor live in engine config (OPT §7), never in the catalog.

### 5.2 Validation summary (per-field)
| Field | Mandatory | Check | Violation → |
|---|---|---|---|
| model_id | ✓ | non-empty string, unique | DUPLICATE_ID |
| name | ✓ | non-empty | MISSING_FIELD |
| category | ✓ | §3.5 closed set + class mapping | BAD_ENUM |
| fixture_class | ✓ | §3.1 enum | BAD_ENUM |
| dim | ✓ | 3 numbers > 0, each ≤ 2500 | BAD_NUMBER |
| finish_options | ✓ | non-empty, all ids in finishes table | MISSING_FIELD / UNKNOWN_FINISH |
| price | ✓ | integer ≥ 1 | BAD_NUMBER |
| priceByFinish | — | keys ⊆ finish_options, values integer ≥ 1 | BAD_NUMBER |
| geometry_descriptor | ✓ | §6 structure + bbox ⊆ dim | GEOMETRY_BBOX_MISMATCH |
| water | class-dep. | §5.1 | BAD_WATER_META |
| feature_tags | ✓ | closed set + exactly one mounting tag | BAD_ENUM / BAD_MOUNTING |
| compatibility | ✓ (may be []) | refs exist, not self | DANGLING_REF / SELF_REFERENCE |
| substitutionIds | — | refs exist, same class, not self | DANGLING_REF / SELF_REFERENCE / BAD_SUBSTITUTE |

## 6. GeometryDescriptor — the `render = catalog geometry` contract

The procedural renderer (PRD §12.2) reconstructs fixtures **only** from this descriptor as clean
axis-aligned primitives sized to exact catalog dimensions. The renderer never invents geometry.

```ts
type Anchor = "floor-back-center" | "wall-face-center" | "deck-center";

interface GeometryDescriptor {
  anchor: Anchor;             // where the origin sits (§6.1)
  primitives: GeoPrimitive[]; // ≥ 1
}

interface GeoPrimitive {
  part: string;               // closed per-class vocabulary (§6.2)
  kind:
    | { shape: "box"; sizeMm: DimMm }
    | { shape: "cylinder"; radiusMm: number; hMm: number };
  offsetMm: { x: number; y: number; z: number }; // from the anchor (§6.1)
  finishable?: boolean;       // true → finish material applied; default false (ceramic white)
}
```

### 6.1 Coordinate convention (deterministic)
- Origin = `anchor`. **+y = up**, **+x = width (right positive when facing the fixture)**,
  **+z = depth (away from the wall)**.
- `floor-back-center`: on the floor at the wall face, centered on the fixture width (toilets,
  vanities, freestanding tubs). `wall-face-center`: on the wall plane (wall-hung toilets, shower
  heads/valves). `deck-center`: on the mounting surface (deck-mount faucets, basins).
- x offsets may be negative (centered parts); y, z offsets ≥ 0.
- **No rotation field.** Primitives are axis-aligned only — AABB determinism (SYSTEM_ARCHITECTURE
  §16, risk 2). Shapes that appear rotated must be composed from axis-aligned parts.

### 6.2 Per-class part vocabulary (closed)
| Class | parts |
|---|---|
| toilet | `tank`, `bowl`, `seat`, `lid` |
| basin | `bowl`, `pedestal`, `counter` |
| faucet | `body`, `spout`, `handle` |
| shower | `valve`, `head`, `arm`, `stem` |
| tub | `shell` |
| vanity | `cabinet`, `top`, `basin` |
| accessory | `body` |

Canonical compositions (PRD §12.2): toilet = tank + bowl (+ seat); thermostatic shower = valve +
head + stem; vanity = cabinet + top + basin.

### 6.3 Load-time geometry check
Union of primitive AABBs (placed at offsets, anchored per §6.1) must be contained in the `dim`
bounding box, tolerance **±10 mm**. Violation → quarantine (`GEOMETRY_BBOX_MISMATCH`); this keeps
footprint-based clearance math (C1/C2) and the render provably the same object.

### 6.4 Renderer contract (normative for `web/render3d`)
- Each primitive → three.js box/cylinder mesh at `anchor + offsetMm`, sized per `kind`.
- `finishable: true` → material color = `swatchHex` of the BOM-chosen finish; others → default
  ceramic white. 2D footprint = `dim` projected; clearances/swings come from the engine trace.
- A changed descriptor must change the render — there is no renderer-side geometry table to drift.

## 7. Compatibility model — C7's authority (ADR-008)

C7 (OPT §4): **hard, pair-level** — every pair of SKUs bound into a candidate must be compatible in
the curated graph, and SKUs must match the feature-constraint set. The graph is **finish-agnostic**;
chosen-finish harmony is a separate deterministic C7 sub-rule evaluated in `engine/rules` (§7.5).

### 7.1 Semantics & precedence
`compatible(a, b) := b ≠ a ∧ ¬veto(a, b) ∧ (force(a, b) ∨ defaultOk(a, b))`
Precedence: **veto > force > default** (the curated override graph is authoritative, ADR-008).

### 7.2 Rule-derived default **[ADR-019]**
```
whiteWare(s)    := s.fixture_class ∈ {toilet, basin, tub, vanity}
families(s)     := { family(f) : f ∈ s.finish_options }
defaultOk(a, b) := whiteWare(a) ∨ whiteWare(b) ∨ (families(a) ∩ families(b) ≠ ∅)
```
Rationale: white-ware is neutral and pairs with everything — the real-world coordination constraint
is among trim/accessory finishes; two finish-bearing SKUs (faucets, showers, accessories) can
coexist only if some finish choice shares a family. Deterministic, auditable, and gives
`finish_options` real C7 content while keeping the override graph authoritative.

### 7.3 Curated override data
- **Force edges** — per SKU: `SKU.compatibility: string[]` (§5). Exactly the §5.3 interface.
- **Veto edges** — central: `data/compat_overrides.ts` exports `{ vetoes: [string, string][] }`
  with an optional note per veto. Vetoes are central because they are product-pair facts, rarely
  owned by one SKU, and this keeps the per-SKU interface identical to §5.3.

### 7.4 Consistency checks at load
| Check | Failure | Policy |
|---|---|---|
| force references nonexistent/quarantined id | DANGLING_REF | the referencing SKU is **quarantined** (strict, OPT §13.4) |
| veto references nonexistent/quarantined id | — | edge ignored + data-gap (an edge cannot be quarantined; documented, never silent) |
| force/veto references self | SELF_REFERENCE | force → SKU quarantined; veto → ignored + data-gap |
| same pair forced and vetoed | — | **veto wins** + data-gap (deterministic) |
| redundant force (already default-ok) / disjoint veto | — | kept as authored + data-gap (redundancy warning) |

### 7.5 Finish harmony (not a graph property)
The chosen finishes of a candidate's finish-bearing fixtures (`faucet`, `shower`, `accessory`)
must share one `FinishFamily`; white-ware is exempt (neutral). Evaluated in `engine/rules` as part
of C7 using catalog families. The catalog supplies data; the rule lives in the rule engine (single
authority per OPT §10).

### 7.6 Built artifact
`compatibilityGraph: Map<model_id, model_id[]>` — symmetric closure, values sorted ascending,
built once at load (OPT §10 `validate_catalog_at_load`), consumed by solver SKU binding and by the
relaxation walk (OPT §13.2).

## 8. Substitution sets (relaxation feed)

`SKU.substitutionIds?: string[]` — curated swap candidates for the relaxation engine's
"swap in a smaller SKU" path (OPT §11, ADR-015). Substitutes are **inputs to relaxation, never a
silent swap**: every relaxed candidate is fully re-validated (OPT §11).

Validation at load: refs exist; **same `fixture_class`** (`BAD_SUBSTITUTE`); no self-reference;
a footprint larger than the source is allowed but flagged as a data-gap (relaxation prefers ≤).

Built artifact: `substitutes: Map<model_id, model_id[]>` = symmetric closure of the explicit sets,
sorted, minus quarantined ids.

## 9. Load-time validation & quarantine pipeline

`loadCatalog()` runs this pipeline once at startup (OPT §10). Order is normative — earlier steps
produce the inputs of later ones; the pipeline always terminates with a usable `CatalogState`.

1. **Aggregate** the `data/` modules into an unvalidated record set.
2. **Structural validation** per §5.2 → quarantine on the first failing check per SKU (one record
   per SKU; deterministic check order = field order in §5.2).
3. **Water metadata** for wet classes (§5.1).
4. **Geometry check** (§6.3).
5. **Uniqueness** of `model_id` (later duplicate quarantined; first kept — deterministic).
6. **Reference integrity** for `compatibility` / `substitutionIds` (§7.4, §8) — including SKUs that
   reference a quarantined id; iterate to fixpoint (a quarantined SKU's referrers are quarantined too).
7. **Override-graph consistency** (§7.4).
8. **Build** `compatibilityGraph` (§7.6) and `substitutes` (§8) over surviving SKUs only.
9. **Canonicalize**: sort SKUs by `model_id`; sort all arrays; compute the hash (§11).
10. **Emit** `CatalogState` + `LoadReport`.

```ts
interface QuarantineRecord { model_id: string; reason: QuarantineReason; detail: string }

interface LoadReport {
  loadedCount: number; quarantinedCount: number;
  dataGaps: string[];           // flattened, sorted — e.g. "K-99999: MISSING_FIELD geometry_descriptor"
  records: QuarantineRecord[];  // typed form, for tests/tools
  catalogVersion: string; snapshotId: string; catalogHash: string;
}

interface CatalogState {        // SYSTEM_ARCHITECTURE §5.3 — unchanged
  skus: SKU[];
  compatibilityGraph: Map<string, string[]>;
  substitutes: Map<string, string[]>;
  dataGaps: string[];
}
```

**Quarantine semantics (OPT §13.4):** a quarantined SKU is excluded from `skus`, the graph,
substitutes, search and scoring. Every quarantine emits a data-gap string into
`CatalogState.dataGaps`, surfaced in `DecisionReceipt.dataGaps` (OPT §12) and the UI. Every
quarantined SKU produces a data-gap; not every data-gap (e.g. an ignored veto edge) quarantines.

## 10. Objective-feed metadata — catalog ↔ engine contract

| Catalog data | Consumed by | Notes |
|---|---|---|
| `price`, `priceByFinish`, chosen finish | `u_cost`, BOM line items | sums deterministic (OPT C8) |
| `finish.luxuryPoints`; `smart`/`thermostatic`/`touchless` tags | `u_luxury` | bonus weights in engine config |
| `finish.wearResistance`; moving-part count = `primitives.length` + complexity points per `smart`/`bidet`/`touchless` tag | `u_maintenance` | deterministic derivation **[ADR-019]** |
| `water.flowRateLpm` / `water.flushLiters` | `u_water` | full-flush value (§5.1) |
| `dim`, `geometry_descriptor` | `u_space`, C1–C6, 2D/3D | |
| `feature_tags` | C7 feature-constraint matching | taste → feature set (OPT §2.3) |

Anchors (eco-gold target, luxury/maintenance ideal/worst) live in engine **config** with rationale
(OPT §7) — never in the catalog. "Brand-tier points" (OPT §6.4) are realized as the config-weighted
combination of `luxuryPoints` + feature bonuses — no separate field **[ADR-019]**.

## 11. Determinism & catalog identity

- Canonical form: SKUs sorted by `model_id`; every array sorted; numbers with ≤ 1 decimal;
  canonical JSON serialized with sorted keys.
- `catalogHash = sha256(canonical form)`; `snapshotId = "<catalogVersion>#<hash[0..8]>"`.
- `snapshotId` participates in the solver input config hash (OPT §14): `hash(I) → hash(plan)`
  covers catalog state, so re-curation invalidates caches deterministically.
- Any data edit bumps `catalogVersion` (semver; data-only fixes patch, schema-affecting minor).

## 12. Curation targets & honesty framing

Content plan for the curated set (PRD §11: real model numbers, list prices, finishes, dimensions):

| Class | Target SKUs | INR price band | Required feature coverage |
|---|---|---|---|
| toilet | 8–10 | 15,000–90,000 | ≥ 2 `low_flow`/`dual_flush`; ≥ 2 `smart` (incl. ≥ 1 `wall_mount`) |
| basin | 8–10 | 6,000–40,000 | ≥ 2 `wall_mount`; ≥ 2 countertop (`deck_mount`) |
| faucet | 10–12 | 5,000–45,000 | ≥ 1 `touchless`; ≥ 2 `single_lever`; ≥ 3 finish families |
| shower | 8–10 | 8,000–120,000 | ≥ 1 `thermostatic` + `rain_shower`; ≥ 2 finish families |
| tub | 5–6 | 25,000–150,000 | ≥ 1 `freestanding`; ≥ 1 alcove (`floor_mount`) |
| vanity | 6–8 | 20,000–90,000 | ≥ 2 sizes ≤ 900 mm wide |
| accessory | 5–8 | 1,500–15,000 | mirrors/towel bars/tissue holders; ≥ 3 finish families |
| **Total** | **50–64** | | |

- `data/catalog_meta.ts` carries: `catalogVersion`, `sourceNote` =
  `"Planning-level compatibility, curated from public KOHLER data. Verify with KOHLER trade data."`
  (surfaced via `DecisionReceipt.honestyFrame`, PRD §11), `jurisdiction: "Pune (demo)"`.
- **Every model number, price and dimension must be hand-verified** against public KOHLER India
  retail data before the demo; the worked examples in §13 are illustrative shapes/levels, not
  verified facts. Hand-verification is a curation acceptance criterion (§16).

## 13. Worked examples (illustrative — hand-verify before demo)

### 13.1 Valid record — two-piece toilet
```ts
{
  model_id: "K-3889-0",
  name: "Cimarron two-piece elongated toilet",
  category: "Toilets", fixture_class: "toilet",
  dim: { w: 375, d: 725, h: 785 },
  finish_options: ["white"],
  price: 27500,
  geometry_descriptor: {
    anchor: "floor-back-center",
    primitives: [
      { part: "bowl", kind: { shape: "box", sizeMm: { w: 375, d: 540, h: 400 } },
        offsetMm: { x: 0, y: 0, z: 185 }, finishable: true },
      { part: "tank", kind: { shape: "box", sizeMm: { w: 375, d: 185, h: 785 } },
        offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
    ],
  },
  water: { flushLiters: 4.8 },
  feature_tags: ["floor_mount", "elongated", "comfort_height"],
  compatibility: ["K-20112-0", "K-22102-0"],
  substitutionIds: ["K-20112-0"],
}
```

### 13.2 Valid record — wall-hung smart toilet
```ts
{
  model_id: "K-5401-0",
  name: "Veil intelligent wall-hung toilet",
  category: "Smart Toilets", fixture_class: "toilet",
  dim: { w: 380, d: 565, h: 480 },
  finish_options: ["white"],
  price: 82000,
  geometry_descriptor: {
    anchor: "wall-face-center",
    primitives: [
      { part: "bowl", kind: { shape: "box", sizeMm: { w: 380, d: 565, h: 480 } },
        offsetMm: { x: 0, y: 220, z: 0 }, finishable: true },
    ],
  },
  water: { flushLiters: 4.5, flushLightLiters: 3.0, dualFlush: true },
  feature_tags: ["wall_mount", "smart", "bidet", "heated_seat", "self_cleaning", "dual_flush"],
  compatibility: [],
  substitutionIds: ["K-3889-0"],
}
```

### 13.3 Valid record — deck-mount faucet
```ts
{
  model_id: "K-72219-4-BL",
  name: "Sensate touchless bathroom faucet",
  category: "Faucets", fixture_class: "faucet",
  dim: { w: 45, d: 160, h: 140 },
  finish_options: ["matte_black", "chrome", "brushed_nickel"],
  price: 32000,
  priceByFinish: { matte_black: 34500, brushed_nickel: 33500 },
  geometry_descriptor: {
    anchor: "deck-center",
    primitives: [
      { part: "body", kind: { shape: "cylinder", radiusMm: 22, hMm: 140 },
        offsetMm: { x: 0, y: 0, z: 0 }, finishable: true },
      { part: "spout", kind: { shape: "box", sizeMm: { w: 32, d: 120, h: 30 } },
        offsetMm: { x: 0, y: 110, z: 0 }, finishable: true },
    ],
  },
  water: { flowRateLpm: 5.7 },
  feature_tags: ["deck_mount", "touchless"],
  compatibility: [],
  substitutionIds: [],
}
```

### 13.4 Quarantined record — missing geometry
```ts
// authored (defective):
{
  model_id: "K-20000-0", name: "Verderosa vitreous china basin",
  category: "Basins", fixture_class: "basin",
  dim: { w: 560, d: 460, h: 190 },
  finish_options: ["white"], price: 14500,
  feature_tags: ["deck_mount"],   // geometry_descriptor absent
  compatibility: [],
}
// → QuarantineRecord { model_id: "K-20000-0", reason: "MISSING_FIELD",
//    detail: "geometry_descriptor is mandatory" }
// → dataGap: "K-20000-0: MISSING_FIELD geometry_descriptor"
// → excluded from skus/graph/substitutes; never enters a scored candidate.
```

## 14. Deferred / out of scope
Full-catalog scale; per-finish imagery and imagery-driven rendering; live/ERP pricing; inch-native
data; locale/currency switching; catalog authoring UI; multi-vendor SKUs; 3D meshes or GLTF assets
(PRD §21, ADR-018).

## 15. Testing requirements — Stage-B gate (ADR-017)

Vitest suites under `packages/engine` (mutants = deliberately defective fixture copies):

1. **Clean load:** curated fixture set loads with `quarantinedCount = 0`; identical hash across
   repeated loads and shuffled module import order.
2. **Quarantine matrix:** one mutant per `QuarantineReason` → correct reason, data-gap string
   emitted, SKU absent from `skus`/graph/substitutes.
3. **Transitive integrity:** A references B; B quarantined ⇒ A quarantined (fixpoint, §9.6).
4. **Override precedence:** veto beats force beats default (§7.1) — assert exact graph contents.
5. **Default rule:** white-ware × trim always compatible; two trims with disjoint families
   incompatible; shared-family trims compatible (§7.2).
6. **Substitutes:** same-class enforcement, symmetric closure, sorted output, larger-footprint
   data-gap flag (§8).
7. **Geometry bbox:** primitive union outside `dim` → `GEOMETRY_BBOX_MISMATCH` (§6.3).
8. **Integration:** no `solve()` output ever references a quarantined id; quarantines appear in
   `DecisionReceipt.dataGaps`; snapshot-id change invalidates the candidate cache.

## 16. Acceptance criteria
1. `loadCatalog()` over the curated set returns a valid `CatalogState` with 50–64 loaded SKUs,
   zero quarantines, and a stable snapshot id.
2. Every §15 test passes; no test depends on network, DOM or state outside the repo.
3. All authored SKUs conform to §5.2 field-for-field; vocabularies are the §3 closed sets.
4. The render path consumes only `geometry_descriptor` (no renderer-side geometry table exists).
5. Model numbers/prices/dims hand-verified (§12); honesty note wired to the receipt.
6. This document, PRD §11, SYSTEM_ARCHITECTURE §5.3 and OPT §4/§6/§13 remain mutually consistent
   (any conflict → reconcile docs before code).

## Appendix A — normative `schema.ts` sketch

```ts
export type FixtureClass = "toilet" | "basin" | "faucet" | "shower" | "tub" | "vanity" | "accessory";
export type FinishFamily = "white" | "chrome" | "brushed_nickel" | "matte_black" | "brushed_gold" | "stone";
export type FeatureTag = "smart" | "bidet" | "heated_seat" | "self_cleaning" | "dual_flush" |
  "low_flow" | "rain_shower" | "thermostatic" | "touchless" | "single_lever" | "floor_mount" |
  "wall_mount" | "deck_mount" | "freestanding" | "comfort_height" | "elongated" |
  "overflow_none" | "soft_close";
export type QuarantineReason = "MISSING_FIELD" | "BAD_TYPE" | "BAD_ENUM" | "BAD_NUMBER" |
  "DUPLICATE_ID" | "BAD_MOUNTING" | "BAD_WATER_META" | "DANGLING_REF" | "SELF_REFERENCE" |
  "BAD_SUBSTITUTE" | "GEOMETRY_BBOX_MISMATCH" | "UNKNOWN_FINISH";
export type Anchor = "floor-back-center" | "wall-face-center" | "deck-center";

export interface DimMm { w: number; d: number; h: number }
export interface WaterMeta { flowRateLpm?: number; flushLiters?: number;
  flushLightLiters?: number; dualFlush?: boolean }
export interface Finish { id: string; label: string; family: FinishFamily;
  luxuryPoints: 1 | 2 | 3; wearResistance: 1 | 2 | 3 | 4 | 5; swatchHex: string }
export interface GeoPrimitive { part: string;
  kind: { shape: "box"; sizeMm: DimMm } | { shape: "cylinder"; radiusMm: number; hMm: number };
  offsetMm: { x: number; y: number; z: number }; finishable?: boolean }
export interface GeometryDescriptor { anchor: Anchor; primitives: GeoPrimitive[] }
export interface SKU { model_id: string; name: string; category: string;
  fixture_class: FixtureClass; dim: DimMm; finish_options: string[]; price: number;
  priceByFinish?: Record<string, number>; image_ref?: string;
  geometry_descriptor: GeometryDescriptor; water?: WaterMeta; feature_tags: string[];
  compatibility: string[]; substitutionIds?: string[] }
export interface QuarantineRecord { model_id: string; reason: QuarantineReason; detail: string }
export interface LoadReport { loadedCount: number; quarantinedCount: number;
  dataGaps: string[]; records: QuarantineRecord[];
  catalogVersion: string; snapshotId: string; catalogHash: string }
export interface CatalogState { skus: SKU[]; compatibilityGraph: Map<string, string[]>;
  substitutes: Map<string, string[]>; dataGaps: string[] }
export interface CompatOverrides { vetoes: [string, string][] }
```

---

*End of PRODUCT_CATALOG_SCHEMA.md v1.0. Concretises PRD §11–§12, SYSTEM_ARCHITECTURE §5.3,
OPTIMIZATION_SPEC §4/§6/§10/§12/§13 and ADR-008/012/017; open choices recorded in ADR-019.*







