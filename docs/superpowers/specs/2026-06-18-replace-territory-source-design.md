# Replace Territory Source — Design

Date: 2026-06-18

## Goal

Let a user replace an existing territory's 3D source (re-upload a new ZIP →
re-convert) **in place**, keeping the same territory identity. Placements
(objects positioned on the territory) must be preserved.

## Why placements survive for free

`placements.territory_id` FKs the `territories(id)` row (CASCADE), not the
artifacts. Replacing the source updates `territories.source_blob_hash` and
re-registers `territory_artifacts` (UPSERT by `(territory_id, lod)`) — the
territory row and its id are unchanged, so placements stay attached with the
same scene-unit coordinates. No placement code is touched.

## Decisions (product Q&A)

- **Coordinates**: same site (re-scan/refinement, same extents) → keep
  placement coordinates verbatim. No remap.
- **Scope**: only the 3D source. Title/description/panorama link are
  untouched (already editable separately via PATCH).
- **During conversion**: show the conversion screen, same as creation
  (redirect to `?jobId`, SSE progress). Scene unavailable while converting.
- **Trigger**: a "Replace source" action on the territory card in the list.
- **Failure mode (Variant A)**: mirror creation. Clear artifacts up front so
  the page shows ConversionPending; if the new ZIP fails to convert the
  territory is temporarily mesh-less, auto-recovered by the reconciler
  (re-queues missing-LOD0 every minute against the new source) or a re-upload.

## Backend

### New endpoint

`POST /api/territories/{slug}/source` — body `{ sourceBlobHash }`, response
`202 { territory, job }` (same `TerritoryCreated` shape as create, so the
frontend reuses the `?jobId` redirect). A sub-resource action, kept separate
from the metadata-only PATCH.

### Gateway `ReplaceTerritorySource(slug, sourceBlobHash)`

1. Validate slug + hash non-empty.
2. `GetTerritory(slug)` → 404 if missing.
3. Set `current.SourceBlobHash = hash`; `UpsertTerritory(current)` — slug is
   non-empty so this is the update path (no slug regeneration).
4. `catalog.DeleteTerritoryArtifacts(slug)` — territory becomes "pending".
5. `mesh.SubmitConversion(KindTerritory, slug)` → job.
6. Return `{ territory, job }`. If step 5 errors, return the saved territory +
   empty job + error (like create); the reconciler will re-queue.

### New catalog gRPC `DeleteTerritoryArtifacts`

- proto: `rpc DeleteTerritoryArtifacts(DeleteTerritoryArtifactsRequest)
  returns (DeleteTerritoryArtifactsResponse)`, request carries `slug`.
- grpcapi handler → service → storage:
  `DELETE FROM territory_artifacts WHERE territory_id =
   (SELECT id FROM territories WHERE slug = $1)`. Unknown slug → no-op
  (idempotent); missing territory is not an error here.
- Repository interface + fakes gain the method.

The worker already reads `source_blob_hash` via `GetTarget(kind, slug)`, so
re-conversion picks up the new source and re-registers artifacts.

## Frontend

- Territory card (home grid) gains a "Replace source" action linking to
  `/territories/[slug]/replace`.
- New route `/territories/[slug]/replace` rendering `ReplaceSourceForm`
  (file-only, reuses `useChunkedUpload`): upload ZIP → `replaceTerritorySource`
  → redirect to `/territories/{slug}?jobId={job.id}`.
- Gateway fn `replaceTerritorySource(slug, { sourceBlobHash })` →
  `POST /api/territories/{slug}/source`.
- The existing territory page shows `ConversionPending` (artifact now
  missing), watches SSE, and transitions to the viewer with the new mesh and
  preserved placements once LOD0 lands.

## API / DTO

- openapi.yaml: add the path + a `TerritorySourceReplace` request schema
  (`{ sourceBlobHash }`), reuse `TerritoryCreated` response. Regenerate Go
  stubs and the frontend DTO.

## Tests

- catalog: `DeleteTerritoryArtifacts` clears rows / no-op on unknown slug.
- gateway: `ReplaceTerritorySource` updates source hash, clears artifacts,
  submits a job, returns it; 404 on unknown slug; mesh error still returns the
  saved territory.

## Verification

- `make test`, `make lint` (no new issues), `yarn lint`, `yarn build`.
- Manual: replace a territory's source → conversion screen → new mesh with
  placements intact.
