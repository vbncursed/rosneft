# CLAUDE.md — backend

Guidance for Claude Code when working in `backend/`.

## Stack

- **Go 1.26.5**, `go.work` workspace with one module per service (`services/*`) plus `pkg/` and `proto/` — 11 modules, all pinning `go 1.26.5`; every build stage is `golang:1.26.5-alpine`. Dependency matrix and bump procedure: [`README.md#toolchain--dependencies`](README.md#toolchain--dependencies).
- **Postgres 17** (catalog), **Redis 8 Streams** (mesh job queue), filesystem `BlobStore` (asset).
- **gRPC** for service-to-service, **HTTP/JSON** for the gateway, OpenAPI spec served by gateway with Scalar UI.
- **Docker Compose** orchestrates the containers: `postgres`, `redis`, `gateway`, `catalog`, `auth`, `twofa`, `passkey`, `content`, `mesh-api`, `mesh-worker`, `asset`, `upload`, `prometheus`. The compose file lives at the repo root (`docker-compose.yml`); `make compose-up` from `backend/` works via `-f ../docker-compose.yml`. The frontend is **not** a compose service — it runs locally (`yarn dev --port 3000`; port 3000, not Vite's 5173, because `PASSKEY_RP_ORIGINS` is pinned to it).

## Services

| Service | Module | Cmds | Role |
| --- | --- | --- | --- |
| gateway | `services/gateway-service` | `gateway` | Public REST + Scalar UI on `:8080`; proxies `/api/assets/*` to asset; speaks gRPC to catalog, content, auth, twofa, passkey, mesh-api, and upload. Runs ETag + Brotli/gzip middleware on JSON, exposes a single-shot scene bundle and SSE job stream. Terminates the chunked-upload protocol on `/api/uploads`. |
| catalog | `services/catalog-service` | `catalog` | Owns territories + models + their artifacts + placements + territory admins. Postgres-backed. API-driven (no startup seeding). Keeps a read-only `ListPanoramaIDs` to validate placement visibility against content's panoramas table (shared DB). |
| content | `services/content-service` | `content` | gRPC `:9007`. Owns **documents** (PDFs) + **panoramas** (equirect images) anchored to a territory — non-geometry media, no mesh pipeline. Shares the `andrey` DB isolated by `content_goose_db_version`; the `territories` FK cascade still cleans up its rows on territory delete. Extracted from catalog. |
| auth | `services/auth-service` | `auth` | gRPC `:9004`. Owns users, roles, permissions, sessions. Postgres + Redis (auth cache, logical DB 1). Delegates 2FA login verification to twofa. |
| twofa | `services/twofa-service` | `twofa` | gRPC `:9006`. Owns TOTP secrets, recovery codes, 2FA verify. Postgres + Redis (logical DB 2). AES-GCM-encrypts secrets at rest. |
| passkey | `services/passkey-service` | `passkey` | gRPC `:9008`. Owns WebAuthn credentials + ceremonies. Postgres (`passkey_credentials`) + Redis (ceremony challenges, logical DB 3). Gateway calls the management RPCs; auth calls `BeginLogin`/`FinishLogin` — `FinishLogin` returns a **verified user id, never a session**. `PASSKEY_RP_ID`/`PASSKEY_RP_ORIGINS` must match the browser address bar exactly. |
| mesh-api | `services/mesh-service` | `mesh-api` | gRPC façade for `SubmitConversion(kind, slug)` / `GetJob`. Writes Redis Streams. |
| mesh-worker | `services/mesh-service` | `mesh-worker` | Consumes the stream, fetches the source ZIP from BlobStore by hash, extracts to a tmp dir, runs the OBJ→GLB converter, applies optional Draco / KTX2 / LOD via `gltfpack`, writes each LOD GLB to BlobStore, registers each artifact in catalog (territory_artifacts vs model_artifacts based on Kind). Runs the reconciler that auto-queues entities whose LOD0 GLB is missing. |
| asset | `services/asset-service` | `asset` | Internal HTTP serving content-addressed GLB blobs with immutable cache headers + ETag. |
| audit | `services/audit-service` | `audit` | gRPC `:9009`. Owns the append-only `audit_log` plus the generic `audit_capture()` trigger attached to every audited table. Shares the `andrey` DB, isolated by `audit_goose_db_version`. Re-attaches its triggers idempotently on every boot via `ensure_audit_triggers()`, so it needs no ordering against the other services' migrations. |
| upload | `services/upload-service` | `upload` | Internal gRPC accepting resumable chunked uploads (`Initiate` / `WriteChunk(stream)` / `GetStatus` / `Finalize` / `Abort`). On Finalize the bytes are SHA-256 hashed and moved into BlobStore; the gateway forwards the resulting hash into `createTerritory` / `createModel`. |

## Architecture conventions

- One concern per file (`process_job.go`, `submit_conversion.go`, …) — never a god-file.
- Storage / service / api packages each have one file with the storage interface + constructor (`pgstorage.go` / `mesh.go` / `students_api.go`-style); every other method gets its own file.
- Domain types live in each service's `internal/domain/` package; no transport types leak in.
- Catalog client lives inside `mesh-service/internal/catalog/`; mesh-service depends on a small interface, not the proto types.
- Bootstrap pattern: `internal/bootstrap/` wires service+transport+config and is the only place that touches `os.Args`/env/clients.
- Errors are sentinels in `domain/errors.go`; transport translates them to gRPC `codes.*` / HTTP statuses.
- **File size cap: 200 lines**, same as the frontend rule. Reviewed by hand on the backend (no ESLint equivalent).
- **Tests**: `testify/suite` for grouping + `gotest.tools/v3/assert` for assertions + `gojuno/minimock/v3` for interface mocks. Stdlib `testing` alone is not used in new tests. Service dependencies are mocked via `//go:generate minimock -i <Interfaces> -o ./mocks -s _mock.go` on the interface file (mirrors auth-service); the generated `mocks/` package is lint-exempt. Assertions stay `gotest.tools` even inside suite methods (`assert.X(s.T(), …)`, not `s.Equal()`). Build the controller per test in `SetupTest` with `minimock.NewController(s.T())` (auto-verifies on cleanup — no manual `AssertExpectations`). For an errgroup/derived-context call, match the ctx with `minimock.AnyContext`.

## Build / run

All commands run from `backend/` (Makefile-driven):

```bash
make build         # ./bin/{gateway,catalog,content,auth,twofa,passkey,mesh-api,mesh-worker,asset,upload}
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

`SERVICES` in the `Makefile` drives `build`/`test`/`lint`/`tidy` — a new service
must be added there or it is silently never built, tested, or linted.

A new service also needs a line in `ops/prometheus/prometheus.yml`, or it is
silently never scraped. Every service already serves `/metrics` on `:9101` by
default, so the target works the moment it is listed — and nothing anywhere
notices that it isn't. That is how audit-service went unmonitored: the
"Services up" tile reads `sum(up{job="services"})`, so it counted 10 and looked
like a healthy number rather than a missing one. The alert rules need no edit,
they aggregate by `job` and by the `service` label.

### Dependency upgrades

Upgrade **per module**, with the workspace disabled:

```bash
for m in pkg proto services/*; do (cd $m && GOWORK=off go get -u ./... && go mod tidy); done
```

With `go.work` active, `go get -u` resolves the sibling `backend/pkg` and
`backend/proto` modules through the module proxy and rewrites their `require`
lines to real pseudo-versions (`v0.0.0-2026…-<sha>`). Reset them to the
placeholder `v0.0.0` afterwards — the `replace … => ../../pkg` directives are
what actually resolve those imports, and a proxy pseudo-version means a stale
published commit can silently shadow local changes:

```bash
sed -i '' -E 's|(backend/(pkg\|proto)) v0\.0\.0-[0-9a-z-]+|\1 v0.0.0|' services/*/go.mod
```

Then `make build && make test && make lint`. Compare lint issue counts against
the pre-upgrade baseline (`git stash` + re-run) — several modules carry
pre-existing findings, so "lint is not clean" is only meaningful as a *delta*.

## Domain model

The catalog now distinguishes two strongly-typed entities:

- **Territory** — a parent scene the viewer renders as the canvas (terrain, photogrammetry mesh).
- **Model** — a placeable 3D asset overlaid on a territory at a specific transform.

Each entity has its own artifact family (`territory_artifacts` / `model_artifacts`) and its own table. `placements` carries `territory_id` + `model_id` FKs, eliminating the old `parent_id <> asset_id` self-placement check (now structurally impossible). Source files (OBJ + MTL + textures) are uploaded as content-addressed ZIP archives via `/api/uploads`; the catalog only stores `source_blob_hash`.

## Mesh conversion pipeline

1. Frontend uploads a ZIP via `POST /api/uploads` (chunked) → `POST /api/uploads/{id}/finalize` returns a `blobHash`.
2. Frontend `POST /api/territories` (or `/api/models`) with `{slug, title, description, sourceBlobHash}` → gateway upserts in catalog and queues `mesh-api.SubmitConversion(kind=TERRITORY|MODEL, slug)` → Redis Stream + Postgres job row. Response carries the `Job` so the client can subscribe to SSE.
3. `mesh-worker` consumes the stream, calls catalog for `ConversionTarget` (kind+slug → source_blob_hash), fetches the ZIP from BlobStore by hash, extracts to a tmp dir, recursively finds the first `.obj`, and runs the converter.
4. Converter: streaming OBJ parser (positions, UVs, faces, fan-triangulation, Z-up→Y-up, V-flip, `usemtl` grouping) → dedup `(v_idx, vt_idx)` pairs → MTL parser (`Kd`, `d`/`Tr`, `map_Kd`) → per-material glTF primitive sharing one position/UV buffer; PBR baseColorFactor (always) + baseColorTexture (when `map_Kd` exists). Texture cache deduplicates images shared across materials. Normalize (center, scale to maxDim=2). Emit GLB.
5. Optional `gltfpack` post-processing pass — flag set chosen by config:
   - `MESH_DRACO_ENABLED=true` (default) → `-cc` adds `KHR_draco_mesh_compression`.
   - `MESH_KTX2_ENABLED=true` (default on) → `-tc` re-encodes textures via Basis Universal (`KHR_texture_basisu`). Frontend MUST register a `KTX2Loader` via `useGLTF.setKTX2Loader(...)` — drei does NOT auto-register one, and missing loader silently produces solid-colour textures.
   - `MESH_LOD_RATIOS=0.5,0.25` (default) → for each ratio, run `gltfpack -si <r>` against the LOD0 GLB to produce LOD1, LOD2, …. LOD0 itself is never simplified (it stays full quality). Frontends that don't request lower LODs simply ignore the extra artifacts.
6. Worker writes each LOD GLB to BlobStore (content-addressed, SHA-256 filename, 2-char prefix sharding) and calls `RegisterTerritoryArtifact` or `RegisterModelArtifact` (selected by Job.Kind) in catalog.
7. Reconciler runs in-process every minute: lists every territory + model via the catalog client, queues `SubmitConversion` for any without a LOD0 artifact — auto-recovers stuck conversions without manual trigger.

### gltfpack binary

`mesh-worker`'s Docker image builds `gltfpack` from `zeux/meshoptimizer` (CMake target) in a multi-stage step and ships it in `/usr/local/bin/gltfpack`. The Go binary stays `CGO_ENABLED=0` and runs in `gcr.io/distroless/cc-debian12:nonroot` (cc has glibc + libstdc++ which gltfpack links against). For local dev, build gltfpack the same way or grab a release binary; or run with all optimisations off.

### Source data layout

Source archives are stored as content-addressed blobs in BlobStore — no host-mounted source directory anymore. The upload-service writes finalized blobs into the same shared `blob-data` Docker volume that mesh-worker reads from. ZIP layout is preserved on extraction so MTL relative-path references to textures continue to resolve (the worker extracts the archive into a per-job tmp dir and points the converter at the first `.obj` it finds).

### Texture handling

- The OBJ's own `mtllib` directive is the source of truth — the converter resolves the MTL relative to the OBJ's directory and falls back to `<obj-base>.mtl` if `mtllib` is missing.
- Each `usemtl` group becomes a separate glTF primitive. The MTL gives every group a `Kd`-derived `baseColorFactor` (with alpha from `d`/`Tr`); `map_Kd` adds a `baseColorTexture` when the file is a JPEG/PNG that exists on disk.
- A missing MTL, missing texture, or missing material reference is logged as a warning — the affected primitives fall back to white/baseColorFactor-only and conversion still succeeds.

## Gateway features for frontend performance

Implemented in `gateway-service`:

- **Scene bundle**: `GET /api/territories/{slug}/scene` aggregates territory + LOD0 artifact (with full `artifacts: [LodArtifact]` chain attached) + placements + model options (each with its own `artifacts: [LodArtifact]` chain) in one round trip via `errgroup` parallel fan-out. Replaces 4+ client requests on first paint and removes any need for follow-up `GetArtifact` calls when the frontend wants a specific LOD.
- **SSE conversion stream**: `GET /api/jobs/{id}/events` emits `event: job` whenever the job state changes; gateway polls mesh-api every 1 s under the hood. Stream terminates on `succeeded` / `failed`. The Job payload carries `kind` and `slug` so the client knows which entity is being converted.
- **Chunked upload**: `POST /api/uploads` initiates a session, `PATCH /api/uploads/{id}` appends bytes (raw `application/octet-stream` body, `Upload-Offset` header), `HEAD` reports current offset for resumability, `POST .../finalize` publishes the bytes to BlobStore. Gateway terminates the public HTTP flow and translates each operation into a gRPC call to upload-service (chunks travel as a client-streaming RPC).
- **ETag** middleware on all GET JSON endpoints — strong ETag = sha256 of the response body, supports `If-None-Match` → 304. PATCH/POST upload endpoints bypass the JSON middleware chain (raw bytes, no compression).
- **Brotli/gzip** middleware on JSON only — `Accept-Encoding` negotiation, br preferred; binary blobs (asset proxy) bypass.
- **Cache-Control: immutable** on `/api/assets/{hash}` (asset-service emits this; gateway proxy preserves the header).

## Placements

Placements are positioned instances of a **Model** overlaid on a **Territory**. Stored in the catalog `placements` table with FKs to `territories(id)` (CASCADE) and `models(id)` (RESTRICT — refuses to drop a model still in use). Self-placement is structurally impossible since the FKs point at different tables. The legacy `placements_no_self` CHECK is gone; only `placements_scale_positive` remains.

Endpoints (gateway):

```
GET    /api/territories/{slug}/placements          → 200 [Placement…]
POST   /api/territories/{slug}/placements          → 201 Placement
PUT    /api/territories/{slug}/placements/{id}     → 200 Placement
DELETE /api/territories/{slug}/placements/{id}     → 204
```

`Placement` carries `territorySlug`, `modelSlug`, `position` (Vec3), `rotation` (Euler XYZ in radians, Three.js convention), `scale` (per-axis Vec3), and an optional `label`. POST defaults: position/rotation zero, scale {1,1,1}. PUT replaces the transform in full — no partial-merge JSON Patch semantics.

Validation:
- 400 `invalid_input` for empty IDs/slugs or non-positive scale
- 404 `not_found` when the territory or model slug is missing
- 404 `not_found` for unknown placement IDs

## Audit journal

Every data mutation is captured by a Postgres trigger, not by application code.
That is what makes coverage provable, and it is why cascades show up for free:
deleting a territory drops its placements, panoramas and documents, and the
trigger fires once per removed row without anyone remembering to log them.

The actor rides gRPC metadata (`x-actor-id` / `x-actor-company`, see
`pkg/grpcutil/actor.go` — no `.proto` carries identity) and is published into
the mutation's own transaction by `pkg/audittx.Run`. **A mutation that skips
`audittx.Run` is still logged, but attributed to nobody** — when adding a
storage method that writes to an audited table, wrap it. The per-service greps
in the audit plan (`grep -Ln audittx.Run …`) are the cheap way to check.

Deliberately unwrapped, each with a comment saying why: the artifact registrars
in catalog (their tables carry no trigger) and `users.MarkTourSeen` (it writes
only ignored columns).

**Adding an audited table? Update `frontend/src/audit/domain/vocabulary.ts`
too.** The journal's filter bar keeps its own copy of the entity list, and
nothing links the two — no compiler, and no test either: `vocabulary.test.ts`
pins the list to what it already contains, so a table added here keeps passing
it. The symptom is silent and one-sided: entries for the new entity show up in
the journal, because `entity` comes from the server, but the Entity dropdown
cannot select it. That already happened once — the list sat at eight entities
while the triggers wrote ten. Note the entity name is the spec array's *second*
column (`territory_assignments` → `territory`), and a new one arrives in a new
migration that `CREATE OR REPLACE`s `ensure_audit_triggers()`, not by editing
`00002`.

`audit_capture()` redacts `password_hash` / `totp_secret` / `code_hash` from
both snapshots, and drops any UPDATE that touched nothing but `updated_at`,
`onboarding_tours_seen` or `rescale_baseline_max` — otherwise an idempotent
upsert or a dismissed tooltip would file an entry with an empty diff.

Visibility: Root (`users.is_owner`) reads everything; everyone else is pinned to
their own company, resolved by `ResolveOwningAdmin` over the `created_by` chain
and surfaced as `ValidateTokenResponse.audit_company_id`. That field exists
separately from `owning_admin_id` because `scopeOwningAdmin` pins a guest's
territory scope to its own id, which would file a guest's changes under a
company of one. The scope is resolved in
`gateway-service/internal/service/audit_scope.go` from the principal and never
from a request parameter, and it **fails closed**: a principal that is neither
Root nor attached to a company is refused, not handed an empty filter.

`audit_log` is append-only via a `BEFORE UPDATE/DELETE/TRUNCATE` trigger.
`REVOKE` alone would not hold — `POSTGRES_USER` owns every table here and could
grant the right back — but the trigger fires against the owner too.

Session events (login, logout, password change, 2FA, passkey) have no row to
capture, so the gateway records them through `Record()`; see `authAuditActions`
in `gateway-service/internal/transport/authhttp/audit.go`. Only events that
change no table belong in that map: user and role mutations are already caught
by the triggers, and listing them would double-write.

The trigger logic is SQL, so it is covered by the repo's only integration tests:
`services/audit-service/internal/migrate/*_integration_test.go`, behind the
`integration` build tag. Run with `go test -tags=integration ./...` from
`services/audit-service`; needs Docker. `make test` stays Docker-free.

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
- Volumes (all named, Docker-managed for nonroot ownership):
  - `blob-data:/var/blob` — BlobStore root, shared between mesh-worker (rw), asset (ro), and upload (rw).
  - `upload-incoming:/var/upload/incoming` — partial-upload session state (per-session subdir, deleted on Finalize/Abort).
  - `postgres-data`, `redis-data` — datastore persistence.
- All services log structured JSON via `log/slog`.
- `gateway` is the only service exposed on the host (`:8080`). Internal services (catalog, mesh-api, upload, asset) bind to the internal Compose network only.

## Tests / CI

- `go test -race -shuffle=on ./...` per module — see `make test`.
- Service-layer coverage lives in `internal/service/*_test.go`, driven by minimock-generated mocks (`internal/service/mocks/`).
- No external dependencies in unit tests (no testcontainers); reconciler & worker behaviour is verified against minimock `QueueMock`/`CatalogMock`/`ConverterMock`.
- New tests use `testify/suite` for grouping, `gotest.tools/v3/assert` for assertions, and `minimock` for mocks. Note: storage-level logic that the service only forwards to (e.g. the catalog rescale CTE) is NOT covered by these service tests — it belongs in a storage integration test if/when one is added.
