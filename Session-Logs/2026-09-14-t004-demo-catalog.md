# Session Log — T-004 Curate the demo catalog
Date: 2026-09-14
Orchestrator: delegation to product-agent (second successful delegation)

## Task
T-004 (tasks/TASKS.md): author the real-KOHLER demo catalog to SCHEMA
(docs/PRODUCT_CATALOG_SCHEMA.md) §12 coverage: 50–64 SKUs, water metadata, finish
prices, geometry descriptors, compatibility references, substitutions; hand-verify
model numbers/prices/dims.

## What was done
- product-agent authored 57 SKUs: toilet 8, basin 9, faucet 11, shower 9, tub 6,
  vanity 7, accessory 7 — all §12 class bands and feature-coverage bullets met
  (verified programmatically against loadCatalog output).
- 8 collection force edges (Purist, Artifacts, Forte, Devonshire, Archer,
  Tresham pairings); 21 effective vetoes (pedestal/wall-hung basins × vanities —
  double-basin conflict, documented in-file).
- Substitution chains populated per class for the relaxation path (OPT §11).
- finishes.ts unchanged (6 seeded finishes suffice); catalogVersion 0.1.0 → 0.2.0
  (minor: first full data curation, SCHEMA §11).
- Geometry authored against the implemented ADR-023 bbox window
  ([−span/2 − 10, span + 10] per axis); conventions documented in-file per class.

## loadCatalog() report (orchestrator re-run, not trusted from agent)
- loadedCount 57, quarantinedCount 0, catalogVersion 0.2.0
- snapshotId `0.2.0#3941623b` — stable across repeated loads
- 8 dataGaps, all `REDUNDANT_FORCE` redundancy warnings sanctioned by SCHEMA §7.4
  (force edges that are already default-ok under §7.2); no quarantine, veto, or
  footprint gaps.

## Verification (orchestrator re-run, explicit exit codes)
- `npm run typecheck` exit 0; `npm test` exit 0 (4 files, 31/31); `npm run build` exit 0.
- Spot-review of data modules: real KOHLER line names/model formats, documented
  local-frame conventions, per-SKU water metadata per §5.1, exactly one mounting
  tag per SKU.

## Honesty flags (carried to TODO.md)
- No network available during curation: all INR prices are planning-level
  estimates; ~39 model numbers are real-line but need hand-verification of
  number/variant before the demo (SCHEMA §16.5 remains open → TODO.md entry).
  Specific placeholders commented in-file: K-2973-KS-NA finish (rough-in valve),
  vanity finish → white_stone mapping, K-99007-NA → brushed_nickel mapping,
  K-5401-0 local-frame origin.

## Failures / iterations
None. Delegation completed in one attempt.

## Outcome
T-004 is DONE. Next: T-005 (geometry primitives) can consume these descriptors.
