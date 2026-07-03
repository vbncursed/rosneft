# catalog-service

Owns the 3D core: territories, models, their artifacts, placements, and
territory admins. Postgres-backed, exposes a gRPC surface (`CatalogService`)
consumed by `gateway` and `mesh-worker`. On boot it can run an auto-migration.
No startup seeding — the catalog is API-driven; entities arrive via gRPC
upserts.

> **Documents and panoramas** (non-geometry media anchored to a territory) were
> split out into [`content-service`](../content-service/README.md). Their tables
> still live in the shared `andrey` DB, so the `territories` FK cascade keeps
> cleaning them up on territory delete; catalog keeps a read-only
> `ListPanoramaIDs` to validate placement-visibility allowlists.

## Responsibilities

- CRUD over `territories`, `models`, their `*_artifacts`, `placements`, and
  territory admin assignments in Postgres.
- Schema migrations (goose-style, auto-applied at startup when enabled).
- Rescale bookkeeping for source-replacement re-conversions and per-placement
  panorama visibility (validated against content's panorama IDs).

## Layout

```
internal/
  bootstrap/   # config → pgstorage → service → grpc server
  config/      # Viper layered config, CATALOG_* env vars
  domain/      # entities + sentinel errors
  slug/        # slug helpers
  storage/     # one file = one DB method; pgstorage.go owns the connection
  migrate/     # auto-migration runner
    migrations/  # numbered *.sql (goose Up/Down)
  service/     # business layer; service.go owns the storage interface + ctor,
               # then one method per file
  transport/
    grpcapi/   # gRPC handlers; server.go has the Service contract, Server
               # struct, registration, and the error mapper; converters.go
               # holds proto<->domain mapping; one RPC per file otherwise
```

The split mirrors the project-wide convention: every storage / service /
transport package has one file with the interface or constructor and the rest
of the files contain a single method each.

## gRPC API — `rosneft.catalog.v1.CatalogService`

Territory, territory-artifact, model, model-artifact, placement, and
territory-admin RPCs (documents + panoramas moved to `content-service`). Proto
lives at `backend/proto/rosneft/catalog/v1/catalog.proto`; generated Go in
`backend/proto/gen/go/rosneft/catalog/v1`. Each RPC has a matching method on the
`Service` interface in `transport/grpcapi/server.go` and its own handler file
(`one RPC per file`).

### Territories

| RPC | Description |
| --- | --- |
| `ListTerritories` | List every territory. |
| `GetTerritory` | Fetch one territory by slug. |
| `UpsertTerritory` | Create or update a territory (keyed by slug). |
| `DeleteTerritory` | Delete a territory by slug (cascades to its artifacts and placements; its content documents/panoramas also cascade at the DB level). |

### Territory artifacts

| RPC | Description |
| --- | --- |
| `RegisterTerritoryArtifact` | Record a converted GLB artifact for a territory + LOD. |
| `ListTerritoryArtifacts` | List all LOD artifacts of a territory. |
| `GetTerritoryArtifact` | Fetch one territory artifact by slug + LOD. |
| `DeleteTerritoryArtifacts` | Clear every LOD artifact of a territory (resets it to pending before a source-replacement re-conversion). |
| `SetTerritoryRescaleBaseline` | Record the territory's current source-mesh max-dimension before a source replacement clears its artifacts; writes only when no baseline is already pending. |
| `RescaleTerritoryPlacements` | Apply a pending rescale baseline: scale every placement's position + scale by `old_max / new_source_max`, then clear the baseline, atomically. Reports how many placements changed. |

### Models

| RPC | Description |
| --- | --- |
| `ListModels` | List every model. |
| `GetModel` | Fetch one model by slug. |
| `UpsertModel` | Create or update a model (keyed by slug). |
| `DeleteModel` | Delete a model by slug (placements FK with `RESTRICT` — refuses to drop a model still in use). |

### Model artifacts

| RPC | Description |
| --- | --- |
| `RegisterModelArtifact` | Record a converted GLB artifact for a model + LOD. |
| `ListModelArtifacts` | List all LOD artifacts of a model. |
| `GetModelArtifact` | Fetch one model artifact by slug + LOD. |

### Placements

| RPC | Description |
| --- | --- |
| `ListPlacements` | List every placement in a territory. |
| `CreatePlacement` | Create a placement (model overlaid on a territory at a transform); optional initial panorama allowlist. |
| `UpdatePlacement` | Replace a placement's transform (position/rotation/scale) and label in full. |
| `SetPlacementVisibility` | Replace a placement's panorama allowlist in full (panorama ids must belong to the placement's territory; validated via `ListPanoramaIDs` against the shared panoramas table). |
| `DeletePlacement` | Delete a placement by id. |

Panorama and document RPCs now live in [`content-service`](../content-service/README.md).

Errors map to gRPC codes in `server.go`: `ErrInvalidInput` →
`InvalidArgument`; the `*NotFound` sentinels (territory, model, artifact,
placement) → `NotFound`; everything else → `Internal`.

## Schema

Migrations are numbered `*.sql` under `internal/migrate/migrations` (goose
`Up`/`Down`). Current shape after `00009`:

- **`territories`** — `id`, `slug` (unique), `title`, `description`,
  `source_blob_hash` (content-addressed source ZIP in BlobStore),
  `external_panorama_url` (`00005`, `''` = unset), `rescale_baseline_max`
  (`00006`, nullable; `NULL` = no rescale pending), timestamps.
- **`territory_artifacts`** — per `(territory_id, lod)` unique; GLB `hash`,
  `content_type`, `size_bytes`, `vertices`, `faces`, bbox min/max XYZ.
  `ON DELETE CASCADE`. Index on `hash`.
- **`models`** — same shape as territories minus the panorama/rescale columns:
  `id`, `slug` (unique), `title`, `description`, `source_blob_hash`,
  timestamps.
- **`model_artifacts`** — per `(model_id, lod)` unique; same artifact columns
  as territory artifacts. `ON DELETE CASCADE`. Index on `hash`.
- **`placements`** — `territory_id` FK (`CASCADE`) + `model_id` FK (`RESTRICT`),
  `label`, per-axis `position`/`rotation`/`scale`, `visible_panorama_ids
  BIGINT[]` (`00007`, allowlist of panoramas the placement shows in; `{}` =
  hidden in all), timestamps. `CHECK placements_scale_positive` (all scale axes
  > 0). Self-placement is structurally impossible (FKs point at two different
  tables); the legacy `placements_no_self` CHECK from the pre-split single-table
  model is gone. Indexes on `territory_id` and `model_id`.
- **`panoramas`** (`00004`) and **`territory_documents`** (`00010`) — created by
  catalog migrations but now **owned by [`content-service`](../content-service/README.md)**;
  they remain in the shared `andrey` DB with a `territory_id` FK (`CASCADE`) so
  catalog's territory delete still cleans them up. catalog only reads panorama
  ids (`ListPanoramaIDs`) for placement-visibility validation.

History note: `00001`/`00002` created a single `projects` table with
host-filesystem source paths and a `parent_id <> asset_id` self-placement
guard; `00003` split it into the strongly-typed `territories` + `models`
entities and moved sources to content-addressed BlobStore hashes. `00008`
added a per-(placement, panorama) label table that `00009` dropped again in
favour of the placement's single territory-level `label`.

## Configuration

All env vars are prefixed `CATALOG_`. Precedence is flag > env > default.
Defaults shown.

| Var | Default | Purpose |
| --- | --- | --- |
| `CATALOG_GRPC_ADDR` | `:9001` | gRPC listener |
| `CATALOG_DB_DSN` | *(required)* | Postgres DSN |
| `CATALOG_AUTO_MIGRATE` | `true` | Run schema migrations on boot |
| `CATALOG_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `CATALOG_LOG_FORMAT` | `json` | `json` / `text` |
| `CATALOG_SHUTDOWN_TIMEOUT` | `15s` | Graceful drain window |

## Run locally

Postgres is required:

```bash
docker run -d --name pg -p 5432:5432 \
  -e POSTGRES_USER=andrey -e POSTGRES_PASSWORD=andrey -e POSTGRES_DB=andrey \
  postgres:17
```

Then from `backend/`:

```bash
make build
./bin/catalog \
  --db-dsn "postgres://andrey:andrey@localhost:5432/andrey?sslmode=disable" \
  --grpc-addr :9001
```

Or via Compose: `make compose-up`.

## Tests

```bash
make test
```

Storage tests run against an in-memory fake; integration coverage is wired
through the higher-level service tests.
