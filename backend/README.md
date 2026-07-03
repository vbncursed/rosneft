# Andrey Backend

Microservices backend for the Andrey 3D viewer. Heavy work (OBJ parsing,
glTF/GLB conversion, Draco compression, KTX2 textures, LOD generation, blob
storage) lives here so the frontend can fetch compact binary assets instead
of 100+ MB ASCII files.

## Stack

- **Go 1.26** — modern stdlib (`slices`, `maps`, `cmp`, `slog`, `errors.AsType`, `wg.Go`, `strings.SplitSeq`)
- **gRPC** — internal service-to-service
- **REST + OpenAPI 3.0** — gateway → frontend (schema-first, `oapi-codegen` generates Go server stubs; frontend generates TS client from the same spec)
- **PostgreSQL 17** — catalog + auth persistence (shared instance, separate tables / goose version table)
- **Redis 8** — async conversion job queue (Streams) + auth sessions (opaque tokens, DB 1)
- **Auth** — argon2id passwords, TOTP 2FA, multi-role RBAC, opaque Redis sessions (`auth-service`)
- **Local FS** — blob storage behind `BlobStore` interface (S3-ready)
- **Cobra + Viper** — CLI / config (flag > env > file > default)
- **gltfpack** (built from `zeux/meshoptimizer` in the worker image) — Draco / KTX2 / LOD encoder

## Services

| Service           | Purpose                                                          | Internal       | External           | RPCs / routes |
| ----------------- | ---------------------------------------------------------------- | -------------- | ------------------ | ------------- |
| `gateway-service` | REST/OpenAPI + scene bundle + SSE + auth middleware + ETag/Brotli | —             | `:8080`            | HTTP paths    |
| `catalog-service` | Territory + model + artifact + placement registry (+ territory admins) | gRPC `:9001` | —                | 48 gRPC       |
| `content-service` | Documents + panoramas anchored to a territory (non-geometry media) | gRPC `:9007` | —                  | 7 gRPC        |
| `auth-service`    | Users, multi-role RBAC, sessions, freeze/soft-delete (2FA → twofa) | gRPC `:9004`   | —                  | gRPC          |
| `twofa-service`   | TOTP 2FA: secrets, recovery codes, verify + lockout              | gRPC `:9006`   | —                  | 6 gRPC        |
| `mesh-service`    | OBJ → GLB + Draco + KTX2 + LOD (`mesh-api` + `mesh-worker`)      | gRPC `:9002`   | —                  | 2 gRPC        |
| `upload-service`  | Resumable chunked uploads (gRPC streaming)                       | gRPC `:9003`   | —                  | 5 gRPC        |
| `asset-service`   | Binary artifact server (Range / ETag / immutable cache)          | HTTP `:8081`   | (via gw proxy)     | 2 HTTP + health |

Per-service READMEs: [gateway](services/gateway-service/README.md) ·
[catalog](services/catalog-service/README.md) ·
[content](services/content-service/README.md) ·
[auth](services/auth-service/README.md) ·
[twofa](services/twofa-service/README.md) ·
[mesh](services/mesh-service/README.md) ·
[upload](services/upload-service/README.md) ·
[asset](services/asset-service/README.md).

`gateway` is the only service published on the host. `catalog`, `content`,
`auth`, `twofa`, `mesh-api`, `upload`, and `asset` bind to the internal Compose
network only — their ports are reachable from sibling services by service name
(`catalog:9001`, `content:9007`, `auth:9004`, …) but not from the host.

Each service owns a README with its full endpoint and env-var tables. The
gateway's public HTTP surface (incl. `/api/auth/*`) is browsable as Swagger at
`http://localhost:8080/docs`.

## Frontend-facing performance features

These live in `gateway-service` and `mesh-service` and feed the corresponding
frontend tasks listed in `documentation/`:

- **Scene bundle endpoint** — `GET /api/territories/{slug}/scene` aggregates
  territory + LOD0 artifact + placements + model options in one round trip.
- **SSE conversion stream** — `GET /api/jobs/{id}/events` replaces 4-second
  client polling with a live event stream.
- **Auth + RBAC** — `/api/auth/*` (login/2FA/me/admin) plus a gateway
  middleware that authenticates the Bearer token via `auth-service` and gates
  every mutating `/api/*` route on a per-route permission.
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
    ├── gateway-service/  # REST edge + auth middleware (cmd/gateway)
    ├── catalog-service/  # Postgres registry: territories/models/artifacts/placements (cmd/catalog)
    ├── content-service/  # documents + panoramas (cmd/content)
    ├── auth-service/     # users/RBAC/sessions (cmd/auth)
    ├── twofa-service/    # TOTP 2FA (cmd/twofa)
    ├── mesh-service/     # cmd/mesh-api + cmd/mesh-worker
    ├── upload-service/   # chunked uploads (cmd/upload)
    └── asset-service/    # blob server (cmd/asset)
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
