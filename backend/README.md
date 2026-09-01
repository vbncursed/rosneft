# Andrey Backend

Microservices backend for the Andrey 3D viewer. Heavy work (OBJ parsing,
glTF/GLB conversion, Draco compression, KTX2 textures, LOD generation, blob
storage) lives here so the frontend can fetch compact binary assets instead
of 100+ MB ASCII files.

## Stack

- **Go 1.27.0** — modern stdlib (`slices`, `maps`, `cmp`, `slog`, `errors.AsType`, `wg.Go`, `strings.SplitSeq`)
- **gRPC** — internal service-to-service
- **REST + OpenAPI 3.0** — gateway → frontend (schema-first, `oapi-codegen` generates Go server stubs; frontend generates TS client from the same spec)
- **PostgreSQL 17** — catalog + auth persistence (shared instance, separate tables / goose version table)
- **Redis 8** — async conversion job queue (Streams) + auth sessions (opaque tokens, DB 1)
- **Auth** — argon2id passwords, TOTP 2FA, WebAuthn passkeys, multi-role RBAC, opaque Redis sessions (`auth-service` + `twofa-service` + `passkey-service`)
- **Local FS** — blob storage behind `BlobStore` interface (S3-ready)
- **Cobra + Viper** — CLI / config (flag > env > file > default)
- **gltfpack** (built from `zeux/meshoptimizer` in the worker image) — Draco / KTX2 / LOD encoder

Every module pins `go 1.27.0` and every service image builds from
`golang:1.27.0-alpine`. See [Toolchain & dependencies](#toolchain--dependencies)
for the full pinned-version matrix.

## Services

| Service           | Purpose                                                          | Internal       | External           | RPCs / routes |
| ----------------- | ---------------------------------------------------------------- | -------------- | ------------------ | ------------- |
| `gateway-service` | REST/OpenAPI + scene bundle + SSE + auth middleware + ETag/Brotli | —             | `:8080`            | HTTP paths    |
| `catalog-service` | Territory + model + artifact + placement registry (+ territory admins) | gRPC `:9001` | —                | 48 gRPC       |
| `content-service` | Documents + panoramas anchored to a territory (non-geometry media) | gRPC `:9007` | —                  | 7 gRPC        |
| `auth-service`    | Users, multi-role RBAC, sessions, freeze/soft-delete (2FA → twofa) | gRPC `:9004`   | —                  | gRPC          |
| `twofa-service`   | TOTP 2FA: secrets, recovery codes, verify + lockout              | gRPC `:9006`   | —                  | 6 gRPC        |
| `passkey-service` | WebAuthn passkeys: credentials, ceremonies, assertion verify     | gRPC `:9008`   | —                  | 6 gRPC        |
| `mesh-service`    | OBJ → GLB + Draco + KTX2 + LOD (`mesh-api` + `mesh-worker`)      | gRPC `:9002`   | —                  | 2 gRPC        |
| `upload-service`  | Resumable chunked uploads (gRPC streaming)                       | gRPC `:9003`   | —                  | 5 gRPC        |
| `asset-service`   | Binary artifact server (Range / ETag / immutable cache)          | HTTP `:8081`   | (via gw proxy)     | 2 HTTP + health |

Per-service READMEs: [gateway](services/gateway-service/README.md) ·
[catalog](services/catalog-service/README.md) ·
[content](services/content-service/README.md) ·
[auth](services/auth-service/README.md) ·
[twofa](services/twofa-service/README.md) ·
[passkey](services/passkey-service/README.md) ·
[mesh](services/mesh-service/README.md) ·
[upload](services/upload-service/README.md) ·
[asset](services/asset-service/README.md).

`gateway` is the only service published on the host. `catalog`, `content`,
`auth`, `twofa`, `passkey`, `mesh-api`, `upload`, and `asset` bind to the
internal Compose network only — their ports are reachable from sibling services
by service name (`catalog:9001`, `content:9007`, `auth:9004`, `passkey:9008`, …)
but not from the host.

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
    ├── passkey-service/  # WebAuthn passkeys (cmd/passkey)
    ├── mesh-service/     # cmd/mesh-api + cmd/mesh-worker
    ├── upload-service/   # chunked uploads (cmd/upload)
    └── asset-service/    # blob server (cmd/asset)
```

## Toolchain & dependencies

### Go toolchain

| Where | Value |
| --- | --- |
| `go.work` + all 11 `go.mod` files | `go 1.27.0` |
| every service `Dockerfile` build stage | `golang:1.27.0-alpine` |
| runtime images | `gcr.io/distroless/static` (all services except mesh-worker) |
| `mesh-worker` runtime image | `gcr.io/distroless/cc-debian12:nonroot` (glibc + libstdc++ for `gltfpack`) |

No `toolchain` directive is pinned — the `go` line is the floor, and CI/dev use
whatever ≥1.27.0 toolchain is installed. Bump procedure:

```bash
# 1. bump the language version everywhere
sed -i '' 's/^go 1\.27\.0$/go 1.27.X/' go.work pkg/go.mod proto/go.mod services/*/go.mod
sed -i '' 's/golang:1\.27\.0-alpine/golang:1.27.X-alpine/' services/*/Dockerfile*
# 2. refresh dependencies per module
for m in pkg proto services/*; do (cd $m && GOWORK=off go get -u ./... && GOWORK=off go mod tidy); done
# 3. test-only deps are NOT reachable from ./... — name them
for m in services/audit-service services/catalog-service; do \
  (cd $m && GOWORK=off go get -u github.com/testcontainers/testcontainers-go \
                                  github.com/testcontainers/testcontainers-go/modules/postgres); done
# 4. verify — the whole gate, not just build/test/lint
make check
# 5. confirm nothing direct is left behind
for m in pkg proto services/*; do (cd $m && GOWORK=off go list -m -u \
  -f '{{if and .Update (not .Indirect)}}{{.Path}} {{.Version}} -> {{.Update.Version}}{{end}}' all); done | sort -u
```

> `sed` on `Dockerfile*`, not `Dockerfile`: `mesh-service` splits its build
> into `Dockerfile.api` and `Dockerfile.worker`, so a plain `-name Dockerfile`
> leaves two stages on the old image and nothing fails until a build runs.

> `go get -u` must run **per module**, not through the workspace. With
> `go.work` active, `go get` resolves the sibling `backend/pkg` and
> `backend/proto` modules from the proxy instead of the local `replace`
> targets and rewrites their `require` lines to real pseudo-versions. Keep them
> at the placeholder `v0.0.0` — the `replace ... => ../../pkg` directives are
> what actually resolve them.

### Shared dependencies (identical version across every module that uses them)

| Module | Version | Used by | Role |
| --- | --- | --- | --- |
| `google.golang.org/grpc` | v1.83.2 | all | Service-to-service transport |
| `google.golang.org/protobuf` | v1.36.12 | proto, auth, catalog, content, mesh | Generated message runtime |
| `github.com/spf13/cobra` | v1.10.2 | all services | CLI root command |
| `github.com/spf13/viper` | v1.21.0 | all services | Layered config (flag > env > default) |
| `github.com/jackc/pgx/v5` | v5.10.0 | auth, catalog, content, passkey, twofa | Postgres driver + pool |
| `github.com/pressly/goose/v3` | v3.27.3 | auth, catalog, content, passkey, twofa | Embedded SQL migrations |
| `github.com/redis/go-redis/v9` | v9.22.0 | auth, mesh, passkey, twofa | Streams (mesh) / sessions / ceremony + rate-limit state |
| `github.com/prometheus/client_golang` | v1.24.1 | pkg, auth, mesh, twofa, upload | `/metrics` exposition |
| `github.com/gojuno/minimock/v3` | v3.4.7 | all services (test) | Generated interface mocks |
| `github.com/stretchr/testify` | v1.12.1 | all (test) | `suite` grouping only |
| `gotest.tools/v3` | v3.5.2 | all (test) | `assert` — the actual assertions |

### Per-module direct dependencies

| Module | Beyond the shared set above |
| --- | --- |
| `pkg` | — (grpc + prometheus + test libs only) |
| `proto` | — (grpc + protobuf only) |
| `gateway-service` | `andybalholm/brotli` v1.2.3 · `getkin/kin-openapi` v0.149.0 · `go-chi/chi/v5` v5.3.2 · `go-chi/cors` v1.2.2 · `oapi-codegen/runtime` v1.7.0 · `samber/slog-chi` v1.19.1 · `golang.org/x/sync` v0.22.0 |
| `catalog-service` | — |
| `content-service` | — |
| `auth-service` | `golang.org/x/crypto` v0.55.0 (argon2id) |
| `twofa-service` | `pquerna/otp` v1.5.0 (TOTP) |
| `passkey-service` | `go-webauthn/webauthn` v0.18.0 |
| `mesh-service` | `qmuntal/gltf` v0.29.0 (GLB writer) |
| `upload-service` | — |
| `asset-service` | — (does not import `proto`; HTTP-only) |

### Notable version moves in the 1.27.0 refresh

| Dependency | From → To | Note |
| --- | --- | --- |
| Go | 1.26.5 → **1.27.0** | Language version in `go.work` and all 12 `go.mod`; every build stage now `golang:1.27.0-alpine` |
| `getkin/kin-openapi` | 0.146.0 → **0.149.0** | The embedded spec validator still round-trips (`make openapi-gen` unchanged) |
| `oapi-codegen/runtime` | 1.6.0 → **1.7.0** | Generated gateway stubs compile unchanged |
| `go-webauthn/webauthn` | 0.17.4 → **0.18.0** | Pre-1.0 minor; passkey register/login ceremonies unchanged |
| `qmuntal/gltf` | 0.28.0 → **0.29.0** | Pre-1.0 minor; GLB writer surface unchanged |
| `testcontainers-go` (+ `modules/postgres`) | 0.43.0 → **0.44.0** | Pre-1.0 minor. `go get -u ./...` does **not** reach it — it is test-only and needs naming explicitly |
| `stretchr/testify` | 1.11.1 → **1.12.1** | |
| `google.golang.org/grpc` | 1.83.0 → **1.83.2** | |
| `google.golang.org/protobuf` | 1.36.11 → **1.36.12** | |
| `golang.org/x/crypto` | 0.54.0 → **0.55.0** | argon2id path unaffected |
| `redis/go-redis/v9` | 9.21.0 → **9.22.0** | |
| `andybalholm/brotli` | 1.2.2 → **1.2.3** | Gateway compression middleware |
| `go-chi/chi/v5` | 5.3.1 → **5.3.2** | |

`make check` passes in full: gofmt, tidy drift, `GOWORK=off go vet`,
golangci-lint, `go test -race -shuffle=on`, govulncheck (0 vulnerabilities
reachable from our code).

Three lint findings were fixed on the way, and none of them came from this
refresh — all three reproduce on the pre-bump tree with the same
golangci-lint 2.13.1, which is newer than the one that recorded the previous
"byte-identical baseline" claim:

- `pkg/grpcutil` (×2, `prealloc`) — the option slices now go through
  `slices.Grow`, which preallocates for the variadic `extra` without giving up
  the readable composite literal.
- `gateway-service` `asset_proxy.go` (`staticcheck` SA1019) —
  `httputil.ReverseProxy.Director` is deprecated as of Go 1.26. Migrated to
  `Rewrite`. This is not a pure rename: `Director` **appends** to a
  caller-supplied `X-Forwarded-For`, while the new code calls
  `SetXForwarded()`, which **replaces** it with the real peer. Nothing
  downstream reads the header, and replacing matches the posture
  `bootstrap/transport.go` already documents for the inbound side. The proxy
  had no tests at all; it now has two.
- `auth-service` `bootstrap/migrate.go` (`gofumpt`) — a missing blank line
  after a single-line function body. `make fmt-check` uses `gofmt -s`, which
  does not see this; only golangci-lint's formatter does.

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
