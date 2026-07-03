# Model thumbnails, picker modal, and placement quantity — design

Date: 2026-07-03

## Goal

Make adding an object onto a territory clearer, and enrich models with an
optional thumbnail image:

1. Replace the plain "Add model" dropdown with a **modal picker** showing each
   model's **name + thumbnail**.
2. Let the placement flow choose a **quantity** — drop N copies at once.
3. Add an **optional thumbnail image** when creating a model, and allow
   **updating** it later.

Hard constraint: do not break existing behaviour. Only touch existing files
additively; territories, panoramas, documents, placement transforms, gizmo,
and the measure tool stay untouched.

## Key reuse (nothing new invented)

- The chunked upload path already forwards `file.type` (e.g. `image/png`);
  `asset-service` serves any blob with its stored Content-Type. The
  `documents` feature (PDF blobs) is the precedent. **No image processing, no
  new storage.** A thumbnail is just a blob hash served via `/api/assets/{hash}`.
- Quantity needs **zero backend change**: the client loops N `POST /placements`.
- Thumbnail update mirrors the existing `TerritoryUpdate` + `PATCH
  /api/territories/{slug}` pattern with a new `ModelUpdate` +
  `PATCH /api/models/{slug}`.

## Decisions

- **Quantity layout:** N independent placements in a row, each offset along X by
  the model's footprint (`step ≈ 2 * scaleUsed * 1.1` scene units — model GLB is
  normalized to max-axis 2, then scaled by the real-world ratio). Not stacked.
- **Thumbnail update location:** the model detail page `/models/[slug]`.
- **Thumbnail is a user-supplied image** (PNG/JPG) uploaded manually — no render.
- Placement quantity default = 1 (current behaviour). Models without a thumbnail
  render a placeholder. Models without a converted LOD stay greyed in the picker
  (existing `usable()` logic); thumbnail and conversion are independent.

## Phase 1 — Backend: `thumbnail_blob_hash` on Model

Mirrors `external_panorama_url` (migration 00005) and `TerritoryUpdate`.

1. `catalog-service/.../migrate/migrations/00012_model_thumbnail.sql` —
   `ALTER TABLE models ADD COLUMN thumbnail_blob_hash text` (nullable).
2. `domain/types.go` — `Model` += `ThumbnailBlobHash string`.
3. Storage — `entityColumns` + `scanModel`, `create_model.go` INSERT,
   `upsert_model.go`; new `set_model_thumbnail.go`
   (`UPDATE models SET thumbnail_blob_hash=$2, updated_at=now() WHERE slug=$1`).
4. `proto/rosneft/catalog/v1/catalog.proto` — `Model` +=
   `string thumbnail_blob_hash = 7;` → `make proto-gen`.
5. Catalog service + gRPC transport — thread the field; new
   `SetModelThumbnail(slug, hash)`.
6. Gateway — `clients/catalog/models.go` (mapping), `transport/httpapi/models.go`
   (POST reads thumbnail from `EntityCreate`; new PATCH handler),
   `service/build_model_options.go` (include thumbnail in `AssetOption`).
7. `openapi.yaml` — `thumbnailBlobHash` on `Model`, `AssetOption`,
   `EntityCreate`; new `ModelUpdate` schema + `PATCH /api/models/{slug}` →
   `make openapi-gen` (regen `openapi_gen.go` + frontend `dto.ts`).
8. Service-layer tests via minimock, mirroring existing model tests.

## Phase 2 — Frontend: domain types + gateways

9. `model/domain/model.ts` — `thumbnailBlobHash?: string`.
10. `placement/domain/asset-option.ts` — `thumbnailUrl?: string` (derived from
    hash via `assetUrl` in the mapper).
11. `model-gateway.ts` — `mapModel` += `thumbnailBlobHash`;
    new `updateModelThumbnail(slug, hash)`; `createModel` body += optional
    `thumbnailBlobHash`.
12. `territory-gateway.ts` `mapAssetOption` — pass `thumbnailUrl`.

## Phase 3 — Picker modal + quantity

13. New `placement/presentation/components/model-picker-modal.tsx` — grid of
    cards (thumbnail + name; placeholder when no image; unconverted models
    greyed per `usable()`), a "Quantity" number input (min 1), a "Place" button.
14. `create-placement-row.tsx` — replace the dropdown with an "+ Add object"
    button that opens the modal. Reuse `usable()`.
15. `use-placements-editor.ts` — `create(modelSlug, visiblePanoramaIds?,
    count = 1)`: loop `count` POSTs, each offsetting `position.x += i * step`.
    `// ponytail:` comment naming the N round-trips ceiling; upgrade path is a
    batch endpoint if N grows large.

## Phase 4 — Thumbnail upload / update

16. Model create — in `batch-upload-form.tsx` (or the `batch-row`), an optional
    `<input type="file" accept="image/*">` shown **only when `kind === "Model"`**
    (territory upload unchanged). On submit, if present:
    `runChunkedUpload(image)` → hash → into the create body.
17. Model update — on `/models/[slug]/page.tsx`, a "Thumbnail" block: preview of
    the current image + a client upload/replace control → `updateModelThumbnail`
    → `router.refresh()`. Gated behind `model:write`.

## Non-breaking guarantees

- All new fields/endpoints are optional and additive.
- Thumbnail input hidden for territories.
- Models without a thumbnail show a placeholder; quantity defaults to 1.
- 200-line file cap respected — modal and thumbnail uploader are separate files.

## Testing

- Backend: service-layer tests for `SetModelThumbnail` and create-with-thumbnail
  via minimock.
- Frontend: manual verification of the picker modal (name + thumbnail render,
  greyed unconverted models), quantity → N offset placements, thumbnail
  create/update round-trips.
