# T-005 — Room & Fixture Geometry Primitives

**Date:** 2026-09-14 · **Owner:** orchestrator (geometry-agent delegation unavailable — weekly agent limit hit; implemented directly) · **Status:** DONE

## Scope delivered

Already present from the interrupted earlier attempt: `geometry/num.ts` (roundMm, approxEqMm), `geometry/polygon.ts` (normalizeRoomPolygon gate, 20 tests). This session completed the remainder:

- `geometry/strips.ts` — `buildWallStrips`: canonical polygon → WallStrip[]. Side names from the outward normal of the CCW y-down edge (top/bottom/left/right); L-shape duplicates get deterministic `-2` suffixes after sorting same-side strips by origin. Strip origin = lexicographically smallest endpoint (matches `contracts/fixtures.ts` convention); direction = unit axis; `usableLengthMm` starts at full edge length. Also `stripInwardNormal`, `stripPoint`, `rangesIntersectMm` (strict-interior overlap, epsilon-aware).
- `geometry/openings.ts` — `validateOpenings` (fixed check order: finiteness → span > 0 → offset ≥ 0 → wall exists → fits on wall → swing side; then pairwise same-wall overlap; touching allowed; reasons deduped preserving order; openings sorted by id) and `subtractKeepClear` (opening span subtracted from usableLengthMm exactly).
- `geometry/slots.ts` — `snapToSlotMm`: nearest multiple of gridMm, ties toward +Infinity (consistent with `Math.round`/roundMm), canonical 1-dp, throws on non-finite/invalid grid.
- `geometry/aabb.ts` — `aabbForPlacement` (back flush on wall, extends along `stripInwardNormal`; 0/180 = w along wall, 90/270 swap w/d; non-multiples of 90° rejected; output canonical 1-dp), `aabbIntersectsMm` (strict overlap; touching within EPSILON_MM is legal — side-by-side fixtures share a boundary), `pointInPolygonMm` (closed polygon, on-boundary = inside, PNPOLY ray cast), `aabbInsidePolygonMm` (4 corners inside AND no polygon edge crossing the box interior — correct for concave L-shapes).
- `geometry/room.ts` — `buildBathroomRep`: the Step-01 gate. Rejects `confirmed !== true` (`input-not-confirmed`), bad polygon (reasons passed through), invalid slot grid, invalid openings. On success returns canonical BathroomRep; `plumbingZones`/`obstacles` empty (T-006/T-007 scope). NEW modules not yet exported from `src/index.ts` (public-surface freeze; TODO item recorded).

## Conventions chosen (for review)

1. **Corner subtraction = zero.** Strips partition the outline corner-to-corner; perpendicular strips overlap only at a point (measure zero), so no usable span is double-counted. Keep-clear = opening span exactly; swing-arc keep-clear is C3's job (T-006).
2. **L-shape side naming** (y-down, CCW input): LSHAPE (0,0)(3000,0)(3000,1200)(1200,1200)(1200,2400)(0,2400) yields top×1, right×2 (x=1200 notch edge, x=3000), bottom×2 (y=1200 notch, y=2400), left×1 — ids `wall-right`/`wall-right-2` etc. assigned by origin order.
3. **Orientation semantics:** 0/180 keep w along-wall; 90/270 swap (same AABB either way — mirrored boxes are identical).
4. **Slot rounding:** nearest, ties toward +Infinity; snapping is a caller concern — `aabbForPlacement` does not snap.

## Incident

The earlier `spawn_agent` run died on a weekly Clinepass limit but had already partially written its own versions of these files; my insertions were then prepended on top, producing duplicated/mixed file content (discovered via TS2300 duplicate-identifier errors). Resolution: truncated the agent copies, kept this implementation, rewrote `slots.ts` cleanly. Files verified clean by tsc + full suite.

## Verification

- `npx tsc --noEmit` (packages/engine): clean.
- `npx vitest run` (packages/engine): 11 files, **101 tests passed** (was 58 before T-005 completion; +43 new).
- Reordered-input determinism: shuffled openings → `canonicalJson`-identical BathroomRep (room.test.ts).
- Degenerate inputs: covered by polygon.test.ts rejection matrix + new gate/opening rejection tests.

## Not done / handoff

- TASKS.md: T-005 → DONE. Next: T-006 (hard geometry rules C1–C6, geometry-agent).
- TODO items added: index.ts export timing; possible relocation of the Step-01 gate module.
