# Rosneft Backend

Microservices backend for the Rosneft 3D viewer. Heavy work (OBJ parsing,
glTF/GLB conversion, Draco compression, KTX2 textures, LOD generation, blob
storage) lives here so the frontend can fetch compact binary assets instead
of 100+ MB ASCII files.

## Stack

- **Go 1.26** — modern stdlib (`slices`, `maps`, `cmp`, `slog`, `errors.AsType`, `wg.Go`, `strings.SplitSeq`)
- **gRPC** — internal service-to-service
- **REST + OpenAPI 3.1** — gateway → frontend (schema-first, `oapi-codegen` generates Go server stubs; frontend generates TS client from the same spec)
- **PostgreSQL 17** — catalog persistence
- **Redis 8 (Streams)** — async conversion job queue
- **Local FS** — blob storage behind `BlobStore` interface (S3-ready)
- **Cobra + Viper** — CLI / config (flag > env > file > default)
- **gltfpack** (built from `zeux/meshoptimizer` in the worker image) — Draco / KTX2 / LOD encoder

## Services

| Service           | Purpose                                                          | Internal       | External           |
| ----------------- | ---------------------------------------------------------------- | -------------- | ------------------ |
| `gateway-service` | REST/OpenAPI + scene bundle + SSE + ETag/Brotli middlewares      | —              | `:8080`            |
| `catalog-service` | Project + model + placement registry (Postgres)                  | gRPC `:9001`   | —                  |
| `mesh-service`    | OBJ → GLB + Draco + KTX2 + LOD (`mesh-api` + `mesh-worker`)      | gRPC `:9002`   | —                  |
| `asset-service`   | Binary artifact server (Range / ETag / immutable cache)          | —              | `:8081` (via gw)   |

Each service owns a README with its full env-var table and routing layout.

## Frontend-facing performance features

These live in `gateway-service` and `mesh-service` and feed the corresponding
frontend tasks listed in `documentation/`:

- **Scene bundle endpoint** — `GET /api/projects/{slug}/scene` aggregates
  project + LOD0 + placements + asset options in one round trip.
- **SSE conversion stream** — `GET /api/jobs/{id}/events` replaces 4-second
  client polling with a live event stream.
- **Project pagination** — `GET /api/projects?limit=&cursor=` (header
  `X-Next-Cursor`).
- **ETag + 304** on JSON endpoints; **Brotli/gzip** content negotiation.
- **Draco** mesh compression (default on), **KTX2** textures (opt-in),
  **LOD** generation (opt-in via `MESH_LOD_RATIOS`) — see
  [`services/mesh-service/README.md`](services/mesh-service/README.md).
- **Cache-Control: immutable** + ETag on `/api/assets/{hash}` blobs.

## Layout

```
backend/
├── go.work               # ties all modules together for local dev
├── proto/                # .proto + generated Go (own go.mod)
├── pkg/                  # shared libs (own go.mod)
└── services/             # one go.mod per service
    ├── gateway-service/
    ├── catalog-service/
    ├── mesh-service/      # cmd/mesh-api + cmd/mesh-worker
    └── asset-service/
```

## Local development

```bash
make compose-up    # build images, start postgres + redis + all services
make compose-logs  # tail logs
make compose-down  # stop everything

make build         # build all binaries to ./bin/
make test          # go test -race across modules (suite + gotest.tools/v3/assert)
make lint          # golangci-lint across modules
make tidy          # go mod tidy across modules
make proto-gen     # buf generate (after .proto files are added)
make openapi-gen   # oapi-codegen for gateway
```

## Conventions

- Clean Architecture + DDD per service: `domain/`, `service/`, `storage/`,
  `transport/`, `bootstrap/`.
- One file per method in storage / service / api layers; the package's
  named file (`pgstorage.go`, `mesh.go`, `students_api.go`) holds the
  storage interface / constructor / wiring.
- 200-line cap per file (reviewed by hand on the backend).
- Tests use `testify/suite` for grouping + `gotest.tools/v3/assert` for
  assertions.
- See [`CLAUDE.md`](CLAUDE.md) for architecture rules and modern Go idioms.
