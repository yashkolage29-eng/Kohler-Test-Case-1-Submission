# Session log — T-026 / T-027 render detail, drag editing, mounting heights, style presets (2026-09-18)

## Scope

One working session in two parts, both driven by user screenshots and Grill-me rounds. The user asked
that no subagents be spawned; all work was done directly by the orchestrator.

1. **T-026:** Planner 5D-level room detail, removal of the decision-receipt panel, and drag editing on
   the page-1 room preview.
2. **T-027:** Fix standalone basins rendering on the floor, and add curated aesthetic presets
   ("Japanese Brutalism, Minimalist Modern, Classic Luxury, Japanese Zen and 2–3 more") to make testing
   more robust.

Constraints in force:
- NVIDIA NIM calls stay below 40 RPM.
- The engine stays the authority for geometry, BOM and validation.
- Surgical changes only.
- `tasks/TASKS.md`, `tasks/TODO.md` and `docs/DECISIONS.md` are updated as work completes.

## Grill-me decisions

| # | Question | Decision |
|---|---|---|
| R1 | Detail priority | Fixture shapes > materials > architecture > camera > décor |
| R1 | Asset source | Procedural three.js for KOHLER fixtures; bundled CC0 files for décor; no AI-generated meshes |
| R1 | Honesty | Detail meshes must stay inside the engine's primitive box |
| R1 | Camera | Keep the orbit overview; add eye-level presets |
| R1 | Receipt panel | Remove entirely (UI, state and narration request) |
| R2 | Drag scope | Walls (resize), doors/windows along a wall, doors/windows onto another wall, and the L-shape corner |
| T-027 Q1 | Basin fix | Engine-owned mounting height + a presentation-only counter slab labelled "not included" |
| T-027 Q2 | Styles | 8 presets: Minimalist Modern, Classic Luxury, Japanese Zen, Japanese Brutalism, Japandi, Scandinavian, Industrial Loft, Coastal |
| T-027 Q3 | What a style changes | Décor + palette + floor/wall materials + preferred finish family (fed through the existing finish chip, so the engine validates it) |
| T-027 Q4 | How a style is chosen | Style cards (no NIM call), plus the AI or offline keywords may name a preset (strict closed enum) |
| T-027 Q5 | New décor | Chandelier, lantern, bench, basket, bowl. The user allowed downloaded models instead of code-drawn ones, with plants capped at 5 MB each |
| T-027 Q6 | "Robust testing" | Unit tests per preset (valid, deterministic placement) + Playwright screenshots of every preset |

## Work completed

### T-026a — Receipt panel removed
- Removed the narration request, state and actions, and the receipt panel with its CSS.
- The result page is now a single column. This saves one NIM call per result.

### T-026b — Drag editing (`web/src/roomDrag.ts`, pure)
- Drag a wall to resize the room.
- Drag an opening along its wall or onto the nearest wall that fits it.
- Drag the L-shape inner corner.
- 10 mm snap and a live label while dragging.
- Every candidate is re-validated with `buildRoomPreview` + `openingError`; only newly introduced errors block a drop.
- One `APPLY_ROOM_DRAG` per drag gives one undo step.

### T-026c — Detailed 3D room (ADR-030)
- **Fixture detail meshes:** tubs, toilets, basins, vanities, faucets, showers, accessories. Each is clamped inside its catalog primitive box.
- **Materials:** procedural marble floor and painted walls.
- **Architecture:** windows (casing, muntins, glass, sill), doors (casing, open leaf), baseboards.
- **Environment:** reflections from a generated environment map.
- **Camera:** overview cutaway and eye-level "View" presets.
- **Assets:** CC0 wood textures and 2 plant GLBs.

### T-027a — Mounting heights (engine `render/mounting.ts`)
- `mountElevationMm(sku)` heights:

  | Product | Height |
  |---|---|
  | Undercounter / wall-hung basin | rim at 850 mm |
  | Vessel basin, deck faucet | base on the 850 mm counter |
  | Shower head / column | top at 2100 mm |
  | Shower valve (no head) | bottom at 1000 mm |
  | Bar / ring / hook | centre at 1100 mm |
  | Tissue holder | centre at 650 mm |
  | Mirrored cabinet | bottom at 1150 mm |
  | Wall-hung toilet | rim at 400 mm |
  | Floor products | 0 |

- `sceneSpec` adds the elevation to catalog y.
- `room3d.buildSupports` draws a counter slab under standalone deck basins and faucets, with an oval cut-out for undercounter bowls. The caption says it is not included.
- Décor `surfaceSpots` now hosts on vanities only, so vases and candles no longer land inside a standalone basin.

### T-027b — Style presets (engine `styles.ts`, ADR-031)
- **Presets:** `STYLES` holds 8 definitions, each with palette, metal, light temperature, floor and wall material, finish family, keywords and curated items.
- **Parser:** `DecorStyle.preset` is optional and strictly parsed.
- **Engine helpers:**
  - `detectStylePreset` uses weighted whole-word keywords.
  - `styleDecorProposal` builds a preset's décor.
  - `offlineDecorProposal(text, preset?)` accepts an explicit preset.
- **AI prompt:** the server décor prompt may now name a preset.
- **Web UI:** style cards on the Taste screen; the `SET_STYLE_PRESET` action (toggle, sets the finish-family chip); the décor key includes the preset; a chosen preset skips the NIM call.
- **Renderer:**
  - Floor and wall materials map to bundled textures, falling back to flat colour.
  - `decorModelUrl(type, preset)` picks a bundled GLB per type and style.
  - Wall models fit width × height; ceiling models hang from the ceiling.
  - Procedural fallbacks exist for the new décor types.
- **Assets (Poly Haven CC0):**
  - Models: glTF 1k run through `gltf-transform optimize` (quantize + WebP) into 28 GLBs.
  - Three potted plants were composed offline from a pot model plus one plant variant (script built on `@gltf-transform/core`).
  - Textures: 11 surface textures at 1024 px, JPEG q72.
  - `public/` totals 9.1 MB; the largest plant is 1.13 MB.
  - Three wall textures were replaced after visual review:
    - concrete: `t_concrete_wall_002` read as brown insulation, replaced by `concrete_slab_wall`
    - plaster: `painted_plaster_wall` had a stain, replaced by `beige_wall_001`
    - limewash: `white_plaster_02` looked splotchy, replaced by `white_stucco`

## Verification

| Check | Result |
|---|---|
| `npm run build` (all packages) | Clean |
| Engine tests | 520 passed (+4 mounting, +5 style presets) |
| Server tests | 76 passed |
| Web tests | 79 passed (+3 supports, +2 model mapping, +1 store preset) |
| `tsc --noEmit` web + server | OK |
| ESLint web | 1 pre-existing error only (`proposals.test.ts` unused `selectedPlan`) |
| Playwright, drag (T-026b) | Wall 2400→2840, depth 1800→1410, door moved wall, L cut 900→1160, undo; no console errors |
| Playwright, 8 style presets + typed "japanese brutalism" brief (3000×2400, window) | Overview + eye-level renders; no console errors, no failed requests; basin on counter; preset materials and models visible |

Screenshots were kept in the session scratchpad, not the repo.

## Issues found and fixed during the session

- **Vitest picked up the Playwright spec:** use the package test script.
- **L-corner drag blocked:** a pre-existing opening error blocked every candidate. Now only newly introduced errors block.
- **Early renders:** the scene was overexposed, wall décor floated after cutaway, and the eye-level camera hugged a side wall. Lights, tagging and camera were fixed.
- **`.glb` not served in production:** added to the static MIME allowlist.
- **Vite "Outdated Optimize Dep" (504) after the engine rebuild:** restarted Vite with `--force`.
- **Decor placement tests after the basin change:** an existing check failed because floor décor positions are rounded to 0.1 mm (33.75 → 33.8). The assertion now allows 0.1 mm.
- **Supports test:** faucet parts stand off the wall by their catalog z offset, so the slab now extends a 60 mm margin into the wall to always meet the wall face.

## Open items (parked in `tasks/TODO.md`)

- The solver places deck faucets as independent wall fixtures, often on a different wall from the basin.
- Basin mount type is inferred from the product name ("vessel") and the `wall_mount` tag; the catalog has no dedicated field.
- Presets steer finish family only, not fixture choice. In the test room, 5 of the 8 presets produced the same BOM.
- Pre-existing:
  - switching Rectangle → L-shape keeps stale opening `wallId`s
  - the preview viewBox overflows during an outward wall drag
  - lint error in `proposals.test.ts`
  - unused server `narrate` route
- The Vite dev server was left running on :5173.

## Files touched

- **Engine:**
  - `src/render/mounting.ts` (new) and `mounting.test.ts` (new)
  - `src/styles.ts` (new)
  - `src/decor.ts` and `decor.test.ts`
  - `src/render/index.ts`, `src/index.ts`
- **Server:** `src/ai/adapter.ts`
- **Web:**
  - `src/main.ts`, `src/store.ts`, `src/proposals.ts`, `src/styles.css`
  - `src/roomDrag.ts` (new) and `roomDrag.test.ts` (new)
  - `src/store.test.ts`, `src/main.test.ts`
  - `src/render3d/`:
    - `sceneSpec.ts`, `build3d.ts`, `mount.ts`
    - `detail.ts` (new), `room3d.ts` (new)
    - `detail.test.ts` (new), `styles3d.test.ts` (new)
    - `sceneSpec.test.ts`, `build3d.test.ts`
  - `public/models/*`, `public/textures/*`, `public/ASSETS.md`
- **Server static:** `packages/server/src/static.ts` (`.glb` MIME)
- **Docs:** `tasks/TASKS.md` (T-026a–c, T-027a–b), `tasks/TODO.md`, `docs/DECISIONS.md` (ADR-030, ADR-031)
