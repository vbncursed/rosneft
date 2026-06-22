# Rescale placements on territory source replacement

**Date:** 2026-06-22
**Status:** Approved (design)

## Problem

When a territory's 3D source is replaced (`ReplaceTerritorySource`, `gateway-service/internal/service/territories.go:42`), existing placements keep their old `scale` and `position`. Those values were authored relative to the *old* territory's normalization, so after the new mesh lands the placed objects are no longer 1:1 with the new model scale — they are sized and positioned for a coordinate system that no longer exists.

### Root cause

Both territory and model GLBs are normalized by the converter to max-axis = 2 (`mesh-service/internal/converter/normalize.go`). A placement's scale is baked at creation time as:

```
scale = modelSourceMax / territorySourceMax
```

(`frontend/src/placement/application/use-placements-editor.ts`, `realWorldRatio`). Position is likewise stored in the territory's normalized scene units. When the source is replaced, `territorySourceMax` changes, but the stored `scale`/`position` do not — so the rendered real-world size and location drift by exactly the ratio of the old to new source max-dimension.

The existing replace-source design (`2026-06-18-replace-territory-source-design.md`) explicitly assumed a same-site re-scan with unchanged extents ("keep placement coordinates verbatim"). It did not cover the case where the new mesh has different real-world dimensions. This spec fills that gap.

## Decision

When a territory's source is replaced, rescale **both** `scale` and `position` of every existing placement by a single uniform factor so each object preserves its real-world size (1:1) and its real-world coordinates relative to the new mesh:

```
factor   = territorySourceMax_old / territorySourceMax_new
scale    *= factor   (all three axes)
position *= factor   (all three axes)
rotation  = unchanged
```

Both quantities are linear in the territory's normalization, so a single factor is mathematically correct for both.

## Approach: server-side automatic rescale in catalog

The fix is **backend-only**. The catalog owns both placements and artifacts, so the rescale runs there, atomically, triggered by the mesh worker the moment the new LOD0 lands. The frontend needs no change: after the rescale the scene bundle returns corrected `scale`/`position`, and `PlacementInstance` applies them verbatim.

The factor needs the **old** max-dimension (captured before the old artifacts are deleted) and the **new** max-dimension (known only after the async conversion completes). A nullable `rescale_baseline_max` column on the territory bridges the async gap.

### Data flow

```
gateway.ReplaceTerritorySource(slug, hash):
  oldMax := maxAxis(GetTerritoryArtifact(slug, LOD0).bbox)   # artifact still present
  if oldMax > 0:
    catalog.SetTerritoryRescaleBaseline(slug, oldMax)        # writes only when baseline IS NULL
  UpsertTerritory(source_blob_hash = hash)
  DeleteTerritoryArtifacts(slug)                             # old bbox gone, oldMax already saved
  SubmitConversion(KindTerritory, slug)

mesh.runConversion (after the LOD-register loop):
  if Kind == KindTerritory:
    newMax := maxAxis(results[0].bbox)                       # results[0] = LOD0, full quality
    catalog.RescaleTerritoryPlacements(slug, newMax)

catalog.RescaleTerritoryPlacements(slug, newMax)  # single transaction:
  baseline := SELECT rescale_baseline_max FROM territories WHERE slug=$1 FOR UPDATE
  if baseline IS NULL:        return (no-op)
  if newMax <= 0:             return (defensive no-op, leaves baseline for retry)
  factor := baseline / newMax
  if |factor - 1| >= 1e-9:
    UPDATE placements
      SET position_x*=factor, position_y*=factor, position_z*=factor,
          scale_x*=factor,    scale_y*=factor,    scale_z*=factor,
          updated_at = NOW()
    WHERE territory_id = (SELECT id FROM territories WHERE slug=$1)
  UPDATE territories SET rescale_baseline_max = NULL WHERE slug=$1
```

### Invariants

- **`rescale_baseline_max` holds the earliest `oldMax`.** `SetTerritoryRescaleBaseline` writes only when the column is `NULL`, so a chain of "replace → conversion fails → reconciler re-queues → replace again" keeps the original old max until it is consumed.
- **The baseline is cleared only on a successful rescale**, atomically with the placement UPDATE in one transaction. A repeated call after clearing is a no-op (idempotent), so worker retries and the reconciler re-registering the same LOD0 cannot double-apply the factor.

## Components (files to change)

### Catalog (`backend/services/catalog-service`)
- `internal/migrate/migrations/00006_territory_rescale_baseline.sql` — `ALTER TABLE territories ADD COLUMN rescale_baseline_max DOUBLE PRECISION` (nullable, default NULL).
- `backend/proto/rosneft/catalog/v1/catalog.proto` — two new RPCs and their request/response messages:
  - `SetTerritoryRescaleBaseline(slug, source_max) → Empty`
  - `RescaleTerritoryPlacements(slug, new_source_max) → { updated }`
  - regenerate via `make proto-gen`.
- `internal/storage/set_territory_rescale_baseline.go` — `UPDATE territories SET rescale_baseline_max=$2 WHERE slug=$1 AND rescale_baseline_max IS NULL`.
- `internal/storage/rescale_territory_placements.go` — the transaction above.
- `internal/service/` — `SetTerritoryRescaleBaseline` + `RescaleTerritoryPlacements` service methods; add both to the repository interface in `catalog.go`.
- `internal/transport/grpcapi/` — two handlers + registration in `server.go`.

### Gateway (`backend/services/gateway-service`)
- `internal/clients/catalog/territories.go` — `SetTerritoryRescaleBaseline` wrapper.
- `internal/service/territories.go` — in `ReplaceTerritorySource`, before `DeleteTerritoryArtifacts`: read `GetTerritoryArtifact(ctx, slug, 0)`; if present and `maxAxis(bbox) > 0`, call `SetTerritoryRescaleBaseline`. A missing LOD0 (territory currently mesh-less) is skipped — the existing baseline is left untouched.

### Mesh (`backend/services/mesh-service`)
- `internal/catalog/` — `RescaleTerritoryPlacements` client wrapper on the small catalog interface.
- `internal/service/process_job.go` — in `runConversion`, after the LOD-register loop, for `KindTerritory` only, compute `newMax` from `results[0]` bbox and call `RescaleTerritoryPlacements`. A rescale error **fails the job** (returned like any other `runConversion` error): the baseline is still set, so a worker retry or the reconciler re-applies the rescale correctly and idempotently. It runs after `j.ArtifactHash`/progress are set but the artifacts are already persisted, so a failed-then-retried job re-registers the same content-addressed LOD0 and re-attempts the rescale.

### Frontend
- No change.

## Edge cases
- **Identical re-scan (`oldMax == newMax`):** `factor == 1.0`; the `|factor−1| < 1e-9` guard skips the placement UPDATE but still clears the baseline.
- **No placements:** UPDATE matches zero rows; baseline still cleared.
- **Initial conversion / model conversion:** baseline never set → no-op.
- **Scale positivity:** `factor > 0`, so `placements_scale_positive` CHECK is preserved.
- **Concurrent replaces:** "set only when NULL" preserves the first `oldMax`.

## Testing (testify/suite + gotest.tools/v3/assert, in-memory fakes)
- **Catalog service:** `SetTerritoryRescaleBaseline` writes only when baseline is NULL (no overwrite); `RescaleTerritoryPlacements` computes `factor = baseline/newMax`, scales both position and scale, clears baseline; second call is a no-op; no-op when baseline NULL; succeeds with zero placements.
- **Gateway `territories_test`:** `ReplaceTerritorySource` sets baseline from old LOD0 max; skips when no LOD0 present; does not overwrite an existing baseline.
- **Mesh `process_job` test:** territory conversion calls `RescaleTerritoryPlacements` with the correct `newMax`; model conversion does not call it.

## Out of scope
- Per-axis (non-uniform) rescaling for bbox aspect-ratio changes — not needed for uniform re-scans.
- Any change to model-source replacement (no such flow exists).
- Any frontend change.
