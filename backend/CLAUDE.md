# CLAUDE.md — backend

Guidance for Claude Code when working in `backend/`.

## Stack

- **Go 1.26**, `go.work` workspace with one module per service (`services/*`) plus `pkg/` and `proto/`.
- **Postgres 17** (catalog), **Redis 8 Streams** (mesh job queue), filesystem `BlobStore` (asset).
- **gRPC** for service-to-service, **HTTP/JSON** for the gateway, OpenAPI spec served by gateway with Scalar UI.
- **Docker Compose** orchestrates the eight containers: `postgres`, `redis`, `gateway`, `catalog`, `mesh-api`, `mesh-worker`, `asset`, `frontend`. The compose file lives at the repo root (`docker-compose.yml`) so the frontend can be a sibling build context; `make compose-up` from `backend/` still works via `-f ../docker-compose.yml`.

## Services

| Service | Module | Cmds | Role |
| --- | --- | --- | --- |
| gateway | `services/gateway-service` | `gateway` | Public REST + Scalar UI on `:8080`; proxies `/blobs/*` to asset; speaks gRPC to catalog and mesh-api. Runs ETag + Brotli/gzip middleware on JSON, exposes a single-shot scene bundle, paginated project list, and SSE job stream. |
| catalog | `services/catalog-service` | `catalog` | Owns projects + artifacts. Postgres-backed. Seeds from `data/projects.yaml`. |
| mesh-api | `services/mesh-service` | `mesh-api` | gRPC façade for `SubmitConversion` / `GetJob`. Writes Redis Streams. |
| mesh-worker | `services/mesh-service` | `mesh-worker` | Consumes the stream, runs the OBJ→GLB converter, applies optional Draco / KTX2 / LOD via `gltfpack`, writes each LOD GLB to BlobStore, registers each artifact in catalog. Runs the reconciler that auto-queues projects whose LOD0 GLB is missing. |
| asset | `services/asset-service` | `asset` | Internal HTTP serving content-addressed GLB blobs with immutable cache headers + ETag. |

## Architecture conventions

- One concern per file (`process_job.go`, `submit_conversion.go`, …) — never a god-file.
- Storage / service / api packages each have one file with the storage interface + constructor (`pgstorage.go` / `mesh.go` / `students_api.go`-style); every other method gets its own file.
- Domain types live in each service's `internal/domain/` package; no transport types leak in.
- Catalog client lives inside `mesh-service/internal/catalog/`; mesh-service depends on a small interface, not the proto types.
- Bootstrap pattern: `internal/bootstrap/` wires service+transport+config and is the only place that touches `os.Args`/env/clients.
- Errors are sentinels in `domain/errors.go`; transport translates them to gRPC `codes.*` / HTTP statuses.
- **File size cap: 200 lines**, same as the frontend rule. Reviewed by hand on the backend (no ESLint equivalent).
- **Tests**: `testify/suite` for grouping + `gotest.tools/v3/assert` for assertions. Stdlib `testing` alone is not used in new tests.

## Build / run

All commands run from `backend/` (Makefile-driven):

```bash
make build         # ./bin/{gateway,catalog,mesh-api,mesh-worker,asset}
make test          # go test -race -shuffle=on across every module
make lint          # golangci-lint per module
make fmt           # gofmt -s -w .
make tidy          # go mod tidy per module
make compose-up    # docker compose up --build -d
make compose-down
make compose-logs
make proto-gen     # buf generate (needs buf)
make openapi-gen   # oapi-codegen for gateway
```

## Mesh conversion pipeline

1. Frontend → `POST /api/projects/{slug}/convert` → gateway → `mesh-api.SubmitConversion` (gRPC) → Redis Stream + Postgres job row.
2. `mesh-worker` consumes the stream, calls catalog for `Project`, reads `SourceObjPath` + `SourceTexturePath` from `/var/source` (mounted from `backend/data/source/`), runs the converter.
3. Converter: streaming OBJ parser (positions, UVs, faces, fan-triangulation, Z-up→Y-up, V-flip, `usemtl` grouping) → dedup `(v_idx, vt_idx)` pairs → MTL parser (`Kd`, `d`/`Tr`, `map_Kd`) → per-material glTF primitive sharing one position/UV buffer; PBR baseColorFactor (always) + baseColorTexture (when `map_Kd` exists). Texture cache deduplicates images shared across materials. Normalize (center, scale to maxDim=2). Emit GLB.
4. Optional `gltfpack` post-processing pass — flag set chosen by config:
   - `MESH_DRACO_ENABLED=true` (default) → `-cc` adds `KHR_draco_mesh_compression`.
   - `MESH_KTX2_ENABLED=true` (default on) → `-tc` re-encodes textures via Basis Universal (`KHR_texture_basisu`). Frontend MUST register a `KTX2Loader` via `useGLTF.setKTX2Loader(...)` — drei does NOT auto-register one, and missing loader silently produces solid-colour textures.
   - `MESH_LOD_RATIOS=0.5,0.25` (default) → for each ratio, run `gltfpack -si <r>` against the LOD0 GLB to produce LOD1, LOD2, …. LOD0 itself is never simplified (it stays full quality). Frontends that don't request lower LODs simply ignore the extra artifacts.
5. Worker writes each LOD GLB to BlobStore (content-addressed, SHA-256 filename, 2-char prefix sharding) and registers each as `Artifact{LOD: N}` in catalog.
6. Reconciler runs in-process every minute: lists catalog projects, queues `SubmitConversion` for any whose LOD0 GLB is missing — no manual trigger needed.

### gltfpack binary

`mesh-worker`'s Docker image builds `gltfpack` from `zeux/meshoptimizer` (CMake target) in a multi-stage step and ships it in `/usr/local/bin/gltfpack`. The Go binary stays `CGO_ENABLED=0` and runs in `gcr.io/distroless/cc-debian12:nonroot` (cc has glibc + libstdc++ which gltfpack links against). For local dev, build gltfpack the same way or grab a release binary; or run with all optimisations off.

### Source data layout

`backend/data/source/<asset-folder>/...` — each project's `.obj`, `.mtl`, `.jpg` live together. The catalog tracks the relative paths (`source_obj_path`, `source_mtl_path`, `source_texture_path` in `data/projects.yaml`); the worker resolves them against `MESH_SOURCE_ROOT` (default `/var/source`).

### Texture handling

- The OBJ's own `mtllib` directive is the source of truth — the converter resolves the MTL relative to the OBJ's directory and falls back to `<obj-base>.mtl` if `mtllib` is missing.
- Each `usemtl` group becomes a separate glTF primitive. The MTL gives every group a `Kd`-derived `baseColorFactor` (with alpha from `d`/`Tr`); `map_Kd` adds a `baseColorTexture` when the file is a JPEG/PNG that exists on disk.
- A missing MTL, missing texture, or missing material reference is logged as a warning — the affected primitives fall back to white/baseColorFactor-only and conversion still succeeds.
- The legacy `source_texture_path` field on `Project` is unused by the converter; it stays in the catalog schema for backward compatibility but new projects should leave it empty.

## Gateway features for frontend performance

Implemented in `gateway-service`:

- **Scene bundle**: `GET /api/projects/{slug}/scene` aggregates project + LOD0 artifact (with full `artifacts: [LodArtifact]` chain attached) + placements + asset options (each with its own `artifacts: [LodArtifact]` chain) in one round trip via `errgroup` parallel fan-out. Replaces 4+ client requests on first paint and removes any need for follow-up `GetArtifact` calls when the frontend wants a specific LOD.
- **SSE conversion stream**: `GET /api/jobs/{id}/events` emits `event: job` whenever the job state changes; gateway polls mesh-api every 1 s under the hood. Stream terminates on `succeeded` / `failed`. Frontend replaces 4-second `router.refresh()` polling.
- **Project pagination**: `GET /api/projects?limit=&cursor=` returns one slug-sorted page; the response carries `X-Next-Cursor` until the last page. Pagination is gateway-side today (catalog still returns all rows) — known scaling concern documented; the wire shape is forward-compatible with DB-cursor pagination.
- **ETag** middleware on all GET JSON endpoints — strong ETag = sha256 of the response body, supports `If-None-Match` → 304.
- **Brotli/gzip** middleware on JSON only — `Accept-Encoding` negotiation, br preferred; binary blobs (asset proxy) bypass.
- **Cache-Control: immutable** on `/api/assets/{hash}` (asset-service emits this; gateway proxy preserves the header).

## Placements

Placements are positioned instances of one project (the **asset**) overlaid on another project's scene (the **parent**). Stored in the catalog `placements` table with FKs to `projects(id)`; `parent_id <> asset_id` and `scale > 0` are CHECK-enforced. Both ends are regular projects — no `kind=scene` vs `kind=asset` distinction.

Endpoints (gateway):

```
GET    /api/projects/{slug}/placements          → 200 [Placement…]
POST   /api/projects/{slug}/placements          → 201 Placement
PUT    /api/projects/{slug}/placements/{id}     → 200 Placement
DELETE /api/projects/{slug}/placements/{id}     → 204
```

`Placement` carries `position` (Vec3), `rotation` (Euler XYZ in radians, Three.js convention), `scale` (per-axis Vec3), and an optional `label`. POST defaults: position/rotation zero, scale {1,1,1}. PUT replaces the transform in full — no partial-merge JSON Patch semantics.

Validation:
- 400 `self_placement` if parentSlug == assetSlug
- 400 `invalid_input` for empty IDs/slugs or non-positive scale
- 404 `project_not_found` when either parent or asset slug is missing
- 404 `placement_not_found` for unknown placement IDs

## Performance notes

- OBJ parser: 5 allocs/op flat, ~260–330 MB/s on Apple M3 (benchmarks in `mesh-service/internal/converter/parse_obj_bench_test.go`). Hot-path uses `unsafe.String` to skip `[]byte→string` copies for `strconv` calls.
- Worker concurrency is bounded by `MESH_MAX_CONCURRENT_JOBS` (0 → `GOMAXPROCS`).
- Asset proxy serves blobs with `Cache-Control: public, max-age=31536000, immutable` and ETag = full SHA-256 hash.

## Modern Go (1.26) — required idioms

- `t.Context()` in tests, never `context.WithCancel(context.Background())`.
- `b.Loop()` in benchmarks, never `for i := 0; i < b.N; i++`.
- `wg.Go(fn)` instead of `wg.Add(1) + go func(){defer wg.Done()...}()`.
- `errors.AsType[T](err)` instead of `errors.As(err, &target)`.
- `for i := range n`, `min`/`max` builtins, `slices`/`maps` packages, `cmp.Or`.
- `omitzero` JSON tag for time/struct/slice fields, never `omitempty`.
- `new(val)` for pointer-to-literal, never `x := val; &x`.
- `strings.SplitSeq` / `bytes.SplitSeq` for range-over-split iteration.

## Docker / Compose specifics

- Images are slim distroless (`distroless/static` for static-link Go services, `distroless/cc` for `mesh-worker` because it ships gltfpack alongside).
- Volumes:
  - `backend/data/source` (host) → `/var/source` (mesh-worker, ro)
  - `backend/data/blobs` (host) → BlobStore root for asset + mesh-worker.
- All services log structured JSON via `log/slog`.
- `gateway` is the only service exposed on the host (`:8080`). Internal services bind to internal Compose network only.

## Tests / CI

- `go test -race -shuffle=on ./...` per module — see `make test`.
- Integration-level coverage lives inside service tests via in-memory fakes (`internal/service/*_test.go`).
- No external dependencies in unit tests (no testcontainers); reconciler & worker behaviour is verified against fakeCatalog/fakeQueue/fakeConverter.
- New tests use `testify/suite` for grouping and `gotest.tools/v3/assert` for assertions.
