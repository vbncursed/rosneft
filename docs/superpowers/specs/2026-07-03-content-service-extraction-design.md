# Design: Extract `content-service` from catalog

**Date:** 2026-07-03
**Status:** Approved for planning
**Author:** brainstorm session (vbncursed + Claude)

## Problem

`catalog-service` has grown into a five-domain junk drawer behind a single
55-RPC `CatalogService` proto:

1. **territories** + artifacts + admins + rescale baseline
2. **models** + artifacts
3. **placements** (FK to *both* territories and models, rescale/visibility logic)
4. **panoramas** (equirect images anchored to a territory point)
5. **documents** (PDFs attached to a territory)

Domains 1–3 are the genuine **3D-scene core**: placements FK both territories and
models, and artifacts are the output of the mesh OBJ→GLB pipeline that registers
back into these tables. They belong together.

Domains 4–5 are outliers: **a blob hash + metadata anchored to a territory**.
Neither touches the mesh pipeline (panorama/document bytes are served raw from
BlobStore via asset-service — no GLB conversion). They ride inside the same proto,
DB ownership, and deploy unit as the heavy 3D machinery purely by co-location.

The goal is **cohesion**: one service = one bounded context, following the
`twofa-service` extraction precedent. This is an architectural-clarity win, not an
operational one — documents/panoramas do not scale or deploy meaningfully
differently. Called out honestly so the tradeoff is explicit.

## Scope

**In scope:** extract `documents` + `panoramas` into a new `content-service`.

**Explicitly NOT in scope:**
- Placements stay in catalog (worst extraction candidate: FKs both tables, central
  to the scene bundle, carries rescale/visibility behavior).
- Territories/models/artifacts/admins stay in catalog.
- No physical database split (see FK decision below).

## Chosen approach

**Approach A** — one new `content-service` owning *both* documents and panoramas
(not two separate services). The shared boundary is "non-geometry media attached to
a territory," which is a real bounded context. One proto, one Dockerfile, one
compose entry, one migration set — half the ceremony of splitting them apart, for
concerns that are individually tiny (documents is 3 RPCs).

Mirrors the `twofa-service` skeleton exactly:

```
services/content-service/
  cmd/content/main.go
  Dockerfile
  go.mod / go.sum
  internal/
    bootstrap/{logger,migrate,postgres,serve,service,transport}.go
    config/config.go
    domain/{document,panorama,errors}.go
    migrate/{migrate,up,down,status}.go + migrations/00001_init.sql
    service/{documents,panoramas}/*.go   # one concern per file, moved from catalog
    storage/{documents,panoramas}/store.go
    transport/grpcapi/{server,documents,panoramas}.go
```

No Redis (documents/panoramas need none). Own gRPC port **`:9007`**.

## Data & the cross-service FK decision

Today both tables live in the shared `andrey` Postgres and hold a hard
`REFERENCES territories(id) ON DELETE CASCADE`:

```sql
territory_documents(id, territory_id FK→territories, title, source_blob_hash, created_at)
panoramas(id, territory_id FK→territories, slug, title, source_blob_hash,
          position_{x,y,z}, yaw_offset, created_at, updated_at, UNIQUE(territory_id, slug))
```

**Decision — B1-lite (shared DB, tables stay put, code moves):**

content-service reads/writes the **existing** `territory_documents` and `panoramas`
tables in the shared `andrey` DB. Only the *serving code* (proto RPCs, service,
storage) moves out of catalog. This is the same isolation level `twofa-service`
already ships (shared `andrey` DB, isolated by its own goose version table).

Consequences:
- **Zero data migration, zero prod cutover risk.** Tables are not recreated or copied.
- **Cascade still works for free.** `DELETE FROM territories` in catalog fires the
  DB-level `ON DELETE CASCADE` on both tables regardless of which service now reads
  them. No app-level `PurgeByTerritory` RPC is needed.
- content-service still resolves `territory_slug → territory_id` the same way
  catalog does today (the slug→id lookup logic moves with the storage code; the
  `territories` table is readable in the shared DB). The gateway keeps passing
  `territorySlug` exactly as now.
- Migration ownership: content-service `00001_init.sql` uses
  `CREATE TABLE IF NOT EXISTS` matching the current schema, so a fresh DB is safe
  whichever service migrates first, and an existing DB is a no-op. Catalog's
  historical migrations that created these tables stay immutable in history; only
  catalog's *serving code* is deleted.

`// ponytail:` this keeps a cross-service FK (content reads territories in the
shared DB), which is the one purity compromise. **Upgrade path (B2, not now):** give
content-service its own physical DB, replace `territory_id` FK with a plain
`territory_slug` column, and handle territory-delete cleanup via a catalog→content
`PurgeByTerritory(slug)` RPC. Deferred — not worth the data-migration + event-plumbing
cost for this project.

## Proto surface (new `content.proto`, package `rosneft.content.v1`)

Moved verbatim from `catalog.proto` (rename messages `content.v1.*`):

```
service ContentService {
  rpc ListDocuments   / CreateDocument   / DeleteDocument
  rpc ListPanoramas   / CreatePanorama   / UpdatePanorama / DeletePanorama
}
```

Removed from `CatalogService`: the 3 document + 4 panorama RPCs (55 → 48).

## Gateway changes (small — already per-concern)

The gateway is already organized per concern, so churn is localized:
- **New client:** `internal/clients/content/client.go` dials `:9007`
  (`GATEWAY_CONTENT_GRPC_ADDR`), plus `documents.go` / `panoramas.go` client methods
  moved from `clients/catalog/`.
- **Service layer:** `service/documents.go` and `service/panoramas.go` re-point their
  dependency from the catalog port to the new `Content` port (add a `Content`
  interface + mock alongside the existing `Catalog` one).
- **Scene bundle:** `service/scene_bundle.go` already fans out to panoramas +
  documents in parallel via errgroup — those two legs now call the content client
  instead of the catalog client. Territories/models/placements legs unchanged.
- **HTTP transport unchanged:** `httpapi/documents.go` / `httpapi/panoramas.go`
  handlers, routes, and the OpenAPI spec are untouched (same REST surface to the
  frontend). This extraction is invisible to the frontend and to the public API.

## Compose / deploy

Add a `content` service to `docker-compose.yml` mirroring `twofa`:
```
content:
  build: services/content-service/Dockerfile
  depends_on: postgres (healthy)
  expose: ["9007"]
  env: CONTENT_GRPC_ADDR=":9007",
       CONTENT_DB_DSN=<shared andrey DSN>,
       CONTENT_AUTO_MIGRATE="true", CONTENT_LOG_LEVEL="info"
gateway.depends_on += content
gateway.env += GATEWAY_CONTENT_GRPC_ADDR="content:9007"
```
Add `content` to the Makefile `SERVICES` list and `go.work`.

## Testing

- Move catalog's `documents_test.go` / panorama service tests into content-service,
  re-pointed at content-service mocks (same `testify/suite` + `gotest.tools` +
  `minimock` conventions per backend CLAUDE.md).
- Gateway: update `scene_bundle_test.go` and any documents/panoramas service tests to
  the new `Content` mock instead of the `Catalog` mock.
- Manual verify: `make compose-up`, then exercise
  `GET/POST/DELETE /api/territories/{slug}/documents`,
  `GET/POST/PUT/DELETE /api/territories/{slug}/panoramas`, and confirm the scene
  bundle still returns `documents[]` + `panoramas[]`. Delete a territory and confirm
  its documents/panoramas cascade-delete.

## Risks

- **Migration clash on the shared table** — mitigated by `CREATE TABLE IF NOT EXISTS`
  in content-service `00001` matching the exact current schema.
- **Two services touching the same tables during rollout** — acceptable: catalog's
  serving code is deleted in the same change, so there is no concurrent-writer window
  once deployed. (If deployed incrementally, catalog's doc/panorama RPCs would simply
  be dead code until removed — harmless.)
- **Stale CLAUDE.md** — backend + frontend CLAUDE.md already omit documents/panoramas
  and auth/twofa from their tables; update the backend services table as part of this
  work.

## Out of scope / deferred (`ponytail:` ledger)

- Physical DB split for content-service (B2 above).
- Any placements extraction.
- Splitting documents and panoramas into separate services.
