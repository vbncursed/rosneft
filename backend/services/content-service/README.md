# content-service

Owns **documents** (PDFs) and **panoramas** (equirectangular images) anchored to
a territory — the non-geometry media of a scene. Neither touches the mesh
OBJ→GLB pipeline; both are just a content-addressed blob hash plus metadata.
Exposes an internal gRPC surface consumed exclusively by `gateway`; it has no
public HTTP listener.

Extracted from `catalog-service` so the catalog stays focused on the 3D core
(territories / models / artifacts / placements). See
[`docs/superpowers/specs/2026-07-03-content-service-extraction-design.md`](../../../docs/superpowers/specs/2026-07-03-content-service-extraction-design.md)
for the rationale.

## Responsibilities

- **Documents**: attach / list / delete PDFs on a territory (`id`, title,
  `source_blob_hash`). No scene position, no slug — identified by id; bytes are
  served from BlobStore via `asset-service` at `/api/assets/{hash}`.
- **Panoramas**: create / list / update / delete equirect images anchored to a
  point in the territory's normalized scene-units space (`position` Vec3 +
  `yaw_offset`). Slug is derived from the title and made unique per territory.
- Validates that the anchoring territory exists (read-only existence check).

## Layout

```
internal/
  bootstrap/   # config → postgres → service → gRPC server (one Init per file)
  config/      # Viper layered config, CONTENT_* env vars
  domain/      # Document, Panorama, Vec3 + sentinel errors (errors.go)
  migrate/     # embedded goose migrations + up/down/status runners
  slug/        # title → URL-safe slug (Cyrillic transliteration); candidates
  storage/     # PG adapter; one file = one DB method; queries.go = scanners
  service/     # business layer; content.go owns the Repository interface +
               # constructor, one method per file
  transport/grpcapi/  # gRPC handlers; server.go has the Service interface,
                      # the Server, registration, and the error mapper
```

Mirrors the project-wide convention: every storage / service / api package has
one file with the interface or constructor and the rest one method each, under
the 200-line cap.

## gRPC API

Internal gRPC only — the server binds to the Compose network and is addressed as
`content:9007`. `gateway` is the sole caller. All 7 RPCs of `ContentService`
(`proto/rosneft/content/v1/content.proto`) are implemented in
`internal/transport/grpcapi/`.

Domain sentinels are mapped to gRPC codes centrally in `server.go` (`mapError`,
via `pkg/apperr`): invalid input → `InvalidArgument`; unknown
territory/panorama/document → `NotFound`; anything else → `Internal`.

| RPC | Request → Response | Description |
| --- | --- | --- |
| `ListPanoramas` | `ListPanoramasRequest` → `ListPanoramasResponse` | Panoramas on a territory, ordered by creation. Unknown territory → `NotFound`. |
| `CreatePanorama` | `CreatePanoramaRequest` → `CreatePanoramaResponse` | Anchor a new equirect; slug derived from title, unique per territory. |
| `UpdatePanorama` | `UpdatePanoramaRequest` → `UpdatePanoramaResponse` | Replace title, position, and yaw offset (source + slug immutable). |
| `DeletePanorama` | `DeletePanoramaRequest` → `DeletePanoramaResponse` | Remove a panorama by id. |
| `ListDocuments` | `ListDocumentsRequest` → `ListDocumentsResponse` | Documents on a territory, ordered by creation. |
| `CreateDocument` | `CreateDocumentRequest` → `CreateDocumentResponse` | Attach a PDF (`source_blob_hash` immutable, no update path). |
| `DeleteDocument` | `DeleteDocumentRequest` → `DeleteDocumentResponse` | Remove a document by id. |

## Data model

content-service shares the `andrey` Postgres database with catalog/auth/twofa;
their migration histories are kept separate by a custom goose version table,
`content_goose_db_version`. It **adopts** the existing tables in place
(`CREATE TABLE IF NOT EXISTS`) rather than copying data.

| Table | Purpose |
| --- | --- |
| `territory_documents` | id, `territory_id` → `territories(id)` `ON DELETE CASCADE`, title, `source_blob_hash`, `created_at`. |
| `panoramas` | id, `territory_id` → `territories(id)` `ON DELETE CASCADE`, slug (`UNIQUE(territory_id, slug)`), title, `source_blob_hash`, `position_{x,y,z}`, `yaw_offset`, timestamps. |

Because the tables live in the shared DB, the `territories` foreign key cascade
still deletes a territory's documents/panoramas automatically — no application
cleanup needed. `catalog-service` keeps a read-only `ListPanoramaIDs` to
validate placement-visibility allowlists against the `panoramas` table.

## Configuration

All env vars are prefixed `CONTENT_` (layered flag > env > default).

| Var | Default | Purpose |
| --- | --- | --- |
| `CONTENT_GRPC_ADDR` | `:9007` | gRPC listener (internal network). |
| `CONTENT_DB_DSN` | *(required)* | Postgres DSN (shared `andrey` DB). |
| `CONTENT_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error`. |
| `CONTENT_LOG_FORMAT` | `json` | `json` / `text`. |
| `CONTENT_AUTO_MIGRATE` | `true` | Run goose migrations on startup. |
| `CONTENT_SHUTDOWN_TIMEOUT` | `15s` | Graceful drain window. |

No Redis. No secret key. Territory existence is validated against the shared DB.

## Run / build / test

From `backend/`:

```bash
make build            # → ./bin/content (among the other service binaries)
make test             # go test -race -shuffle=on across modules
```

The binary is a cobra command. `serve` (the default) starts the gRPC server;
migrations have dedicated subcommands:

```bash
./bin/content serve          --db-dsn "$DSN"
./bin/content migrate-up     --db-dsn "$DSN"   # apply pending migrations
./bin/content migrate-down   --db-dsn "$DSN"   # roll back the most recent
./bin/content migrate-status --db-dsn "$DSN"   # print migration status
```

With `CONTENT_AUTO_MIGRATE=true` (default), `serve` migrates on startup. Or via
Compose: `make compose-up` (content shares `postgres` with the rest of the
stack).

Service-layer tests run against minimock-generated fakes
(`internal/service/mocks/`); no external Postgres is required for the unit
suite.
