# gateway-service

Public HTTP edge of the Andrey backend. Translates `/api/*` REST calls into
gRPC requests against `catalog`, `content`, `mesh-api`, `upload`, `auth`, and
`twofa`, proxies binary asset traffic to `asset`, terminates the chunked-upload
protocol, streams conversion progress over SSE, and serves the OpenAPI spec +
Scalar UI for human/agent discovery.

This is the only backend service exposed on the host network; everything else
binds to the internal Compose network only.

## Responsibilities

- REST → gRPC mapping for catalog (territories, models, artifacts, placements),
  content (documents, panoramas), mesh (conversion jobs queued on create /
  source-replace), upload (chunked sessions), and auth (sessions, users, roles,
  permissions; 2FA management proxied through auth to twofa).
- **Scene bundle** aggregator: `GET /api/territories/{slug}/scene` returns
  territory + LOD0 artifact (with full LOD chain attached) + placements +
  model options (each with its own LOD chain) + panoramas in one round trip
  (errgroup-based parallel fan-out to catalog). The frontend never has to
  follow up with `getArtifact` to pick a specific LOD — every level is already
  in the bundle.
- **SSE conversion stream**: `GET /api/jobs/{id}/events` pushes job state
  changes in real time, replacing client-side polling.
- **Chunked upload protocol**: `POST /api/uploads` → `PATCH` (raw bytes,
  `Upload-Offset` header) → `POST .../finalize`, with `HEAD` for resumable
  offset reporting and `DELETE` to abort. Each operation translates to a gRPC
  call against upload-service; the resulting blob hash feeds create-territory /
  create-model / replace-source.
- **Authentication & RBAC**: `/api/auth/*` (login, 2FA, self-service, and admin
  user/role/permission management) served over the auth gRPC client; the whole
  `/api` JSON group is protected by an `Authenticate` middleware plus a
  per-route permission gate.
- **ETag + 304 Not Modified** on all GET JSON endpoints.
- **Brotli / gzip** compression negotiated via `Accept-Encoding` (br preferred);
  applied to JSON only — the binary blob proxy and SSE stream bypass it.
- HTTP reverse-proxy of `/api/assets/{hash}` → asset-service, preserving
  immutable `Cache-Control` and ETag headers from the upstream.
- CORS, request logging, OpenAPI/Scalar UI mounting.

## Layout

```
internal/
  bootstrap/   # wires config → clients → server, owns os.Args/env
               # transport.go: chi router + middleware chain
  config/      # Viper layered config, GATEWAY_* env vars
  domain/      # shared types and errors (Territory, Model, Artifact,
               # Placement, Panorama, SceneBundle, AssetOption, Job)
  service/     # one file = one method
               # gateway.go: Catalog/Content/Mesh/Upload interfaces + Gateway + ctor
               # get_scene_bundle.go, build_asset_options.go, …
  clients/
    catalog/   # gRPC client for catalog-service (one method per file)
    content/   # gRPC client for content-service (documents + panoramas)
    mesh/      # gRPC client for mesh-api (one method per file)
    upload/    # gRPC client for upload-service
    auth/      # gRPC client for auth-service
    twofa/     # gRPC client for twofa-service
  transport/
    httpapi/   # oapi-codegen strict handlers (one file per route) + middleware
               # etag_middleware.go, compress_middleware.go
               # watch_job_events.go (SSE), docs.go / spec.go (Scalar)
    authhttp/  # plain-chi /api/auth/* handlers + Authenticate +
               # RequirePermissionForRoute middleware + route_permissions.go
    proxy/     # asset-service reverse proxy
api/
  openapi.yaml             # source of truth for the public API
  oapi-codegen.yaml        # server-stub pass (excludes the `auth` tag)
  oapi-codegen-spec.yaml   # embedded-spec pass (FULL spec incl. auth for docs)
```

## API summary

All `/api/*` routes require a valid session — the `andrey_session` cookie or a
Bearer header (see **Auth**) — except
`/api/auth/login`, `/api/auth/login/2fa`, `/healthz`, `/readyz`, `/docs`, and
`/openapi.json`, which are public. Mutating routes additionally require the
permission noted in the **Perm** column.

### Territories

| Method | Path | Perm | Description |
| --- | --- | --- | --- |
| GET | `/api/territories` | — | List territories |
| POST | `/api/territories` | `territory:write` | Register a territory + queue conversion (202, `{territory, job}`) |
| GET | `/api/territories/{slug}` | — | One territory |
| PATCH | `/api/territories/{slug}` | — | Update mutable fields (no re-conversion) |
| DELETE | `/api/territories/{slug}` | `territory:delete` | Delete territory + its placements |
| POST | `/api/territories/{slug}/source` | — | Replace source ZIP + re-queue conversion |
| GET | `/api/territories/{slug}/scene` | — | **Bundle: territory + LOD0 + placements + model options + panoramas** |
| GET | `/api/territories/{slug}/artifacts` | — | List artifacts (all LODs) |
| GET | `/api/territories/{slug}/artifacts/{lod}` | — | Specific LOD |

### Models

| Method | Path | Perm | Description |
| --- | --- | --- | --- |
| GET | `/api/models` | — | List models |
| POST | `/api/models` | `model:write` | Register a model + queue conversion (202, `{model, job}`) |
| GET | `/api/models/{slug}` | — | One model |
| DELETE | `/api/models/{slug}` | `model:delete` | Delete model (refused if still placed) |
| GET | `/api/models/{slug}/artifacts` | — | List artifacts (all LODs) |
| GET | `/api/models/{slug}/artifacts/{lod}` | — | Specific LOD |

### Placements

| Method | Path | Perm | Description |
| --- | --- | --- | --- |
| GET | `/api/territories/{slug}/placements` | — | List placements on a territory |
| POST | `/api/territories/{slug}/placements` | `placement:write` | Add a placement |
| PUT | `/api/territories/{slug}/placements/{id}` | `placement:write` | Replace a placement's transform |
| DELETE | `/api/territories/{slug}/placements/{id}` | `placement:delete` | Remove a placement |
| PUT | `/api/territories/{slug}/placements/{id}/visibility` | — | Replace the placement's panorama allowlist |

### Panoramas

| Method | Path | Perm | Description |
| --- | --- | --- | --- |
| GET | `/api/territories/{slug}/panoramas` | — | List panoramas anchored to a territory |
| POST | `/api/territories/{slug}/panoramas` | `panorama:write` | Anchor a new equirect panorama |
| PUT | `/api/territories/{slug}/panoramas/{id}` | `panorama:write` | Replace title / position / yaw |
| DELETE | `/api/territories/{slug}/panoramas/{id}` | `panorama:delete` | Remove a panorama |

### Uploads (chunked protocol)

| Method | Path | Perm | Description |
| --- | --- | --- | --- |
| POST | `/api/uploads` | `upload:create` | Start a chunked upload session (201, `{id, size, offset}`) |
| HEAD | `/api/uploads/{id}` | — | Query current offset (`Upload-Offset` / `Upload-Length` headers) |
| PATCH | `/api/uploads/{id}` | `upload:create` | Append raw bytes at `Upload-Offset` (204) |
| DELETE | `/api/uploads/{id}` | — | Abort an in-progress session |
| POST | `/api/uploads/{id}/finalize` | `upload:create` | Publish bytes to BlobStore → `{hash, size}` |

### Jobs, assets, metrics, ops

| Method | Path | Perm | Description |
| --- | --- | --- | --- |
| GET | `/api/jobs/{id}/events` | session | **SSE stream of job state changes** (root router, bypasses the JSON chain but not `Authenticate`) |
| GET, HEAD | `/api/assets/{hash}` | session + tenant | Binary GLB / panorama image (reverse-proxied to asset-service). Scoped by `RequireBlobAccess`, not by the territory gate: a blob hash addresses content and is deduplicated, so it has no single territory. Model blobs pass for everyone — shared library. 404 on refusal, 503 if the catalog is unreachable. |
| GET | `/api/metrics/query` | **owner only** | Prometheus panel query — `?panel=<id>&range=1h\|6h\|24h\|7d` → `[MetricSeries]`. The panel id resolves to server-side PromQL, so no caller expression reaches Prometheus. |
| GET | `/docs` | public | Scalar API reference UI |
| GET | `/openapi.json` | public | Machine-readable spec (full, incl. auth) |
| GET | `/healthz`, `/readyz` | public | Liveness / readiness |

### Auth (`/api/auth/*`)

Served by the plain-chi `authhttp` package over the auth gRPC client, mounted
on the root router (not under the `/api` strict-handler group) so `login` and
`login/2fa` can be public. Self routes require any valid session; admin routes
add a per-route permission.

| Method | Path | Perm | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | public | Authenticate by email/username + password (returns token or 2FA challenge) |
| POST | `/api/auth/login/2fa` | public | Complete a 2FA login challenge |
| POST | `/api/auth/logout` | session | Revoke the current session |
| GET | `/api/auth/me` | session | Current user (roles + permissions) |
| POST | `/api/auth/me/password` | session | Change own password |
| POST | `/api/auth/2fa/setup` | session | Provision a pending TOTP secret + otpauth URL |
| POST | `/api/auth/2fa/enable` | session | Confirm TOTP, receive recovery codes |
| POST | `/api/auth/2fa/disable` | session | Disable TOTP |
| GET | `/api/auth/users` | `users:read` | List users (`?status=&includeDeleted=`) |
| POST | `/api/auth/users` | `users:write` | Create a user |
| GET | `/api/auth/users/{id}` | `users:read` | Get a user |
| PATCH | `/api/auth/users/{id}` | `users:write` | Update a user's roles / email / username |
| POST | `/api/auth/users/{id}/freeze` | `users:freeze` | Freeze a user, killing their sessions |
| POST | `/api/auth/users/{id}/unfreeze` | `users:freeze` | Unfreeze a user |
| DELETE | `/api/auth/users/{id}` | `users:delete` | Soft-delete a user |
| POST | `/api/auth/users/{id}/restore` | `users:delete` | Restore a soft-deleted user |
| GET | `/api/auth/roles` | `roles:read` | List roles |
| POST | `/api/auth/roles` | `roles:manage` | Create a role |
| PATCH | `/api/auth/roles/{slug}` | `roles:manage` | Rename a role |
| DELETE | `/api/auth/roles/{slug}` | `roles:manage` | Delete a non-system role |
| PUT | `/api/auth/roles/{slug}/permissions` | `roles:manage` | Replace a role's permissions |
| GET | `/api/auth/permissions` | `permissions:read` | List the permission catalog |

## Middleware chain

```
client → CORS → RequestID → Recoverer → slog-chi               ← root router
  ├── /healthz, /readyz, /docs, /openapi.json
  ├── /api/assets/{hash}    → Authenticate → RequireBlobAccess → asset proxy
  ├── /api/jobs/{id}/events → Authenticate → SSE handler           ← bypass JSON mw
  ├── /api/metrics/query    → Authenticate → owner check → Prometheus proxy
  ├── /api/auth/*           → authhttp (login public; self/admin gated)
  └── /api/* group → Authenticate → RequirePermissionForRoute
                   → RequireTerritoryAccess → RequireCSRF
                   → ETag → Compress(br/gzip/deflate) → openapi strict handlers
```

- **`Authenticate`** (`authhttp/middleware.go`) validates the caller's session
  token against auth-service via gRPC and injects the principal (user id +
  permission snapshot) into the request context; a missing or invalid token
  yields 401. The token comes from the `andrey_session` cookie first and the
  `Authorization: Bearer …` header second (`sessionToken` in `authhttp/respond.go`)
  — Bearer stays supported for curl, tests and non-browser clients.
- **`RequirePermissionForRoute`** (`authhttp/route_permissions.go`) matches the
  resolved chi route pattern against a `"METHOD pattern" → permission` table
  (mutations only; reads need just a valid session) and returns 403 if the
  principal lacks the permission. A new mutating route added without a table
  entry is ungated — keep the table in sync.
- **`RequireTerritoryAccess`** (`httpapi/territory_gate.go`) refuses a caller any
  route whose chi pattern starts with `/api/territories/{slug}` unless the
  territory is assigned to them. It answers **404, never 403** — a 403 confirms
  the territory exists, and to another tenant it must not — with a body identical
  to a genuinely missing slug. Mounted after the permission gate on purpose: that
  check costs no network, so a caller already heading for a 403 should not first
  buy a catalog lookup. Root bypasses it; a non-Root principal with an empty
  scope is refused, because an empty scope disables the catalog's filter entirely
  rather than meaning "no access".
- The `/api/auth/*` group is mounted separately on the root router and runs its
  own `Authenticate` + per-route `require(perm)`, so login can stay public.
- The **asset proxy** is excluded from compression so binary GLBs / panorama
  images aren't re-compressed (already Draco/KTX2-compressed), and the **SSE
  handler** is excluded so the body isn't buffered or transformed mid-stream.

## Downstream gRPC dependencies

| Backend | Address (default) | Used for |
| --- | --- | --- |
| catalog-service | `catalog:9001` | territories, models, artifacts, placements, panoramas |
| mesh-api | `mesh-api:9002` | queue conversions, job status / SSE polling |
| upload-service | `upload:9003` | chunked-upload sessions (init / write / status / finalize / abort) |
| auth-service | `auth:9004` | sessions, token validation, users, roles, permissions |
| asset-service | `http://asset:8081` | binary blob reverse proxy (HTTP, not gRPC) |

## OpenAPI / docs generation

The OpenAPI spec (`api/openapi.yaml`) is the source of truth, regenerated via
`make openapi-gen` from `backend/`. Generation runs in **two oapi-codegen
passes**:

1. **`oapi-codegen.yaml`** — emits the chi/strict server stubs + models, but
   **excludes every tag that has a hand-written handler**
   (`exclude-tags: [auth, assets, jobs, metrics, ops]`). Those routes can't sit
   under the `/api` group's uniform middleware: `login` must be public, the
   asset proxy streams binary, SSE must not be buffered, the metrics proxy needs
   an owner check, and the probes must answer before the stack is up.
2. **`oapi-codegen-spec.yaml`** — emits an `embedded-spec` blob containing the
   **full** spec (every tag) into the binary. `GetSpec()` serves it at
   `/openapi.json`, so the Scalar UI at `/docs` documents the complete surface —
   hand-served routes included — even though they bypass the generated server.

Adding a route to `openapi.yaml` is only half the job: the served spec is the
**embedded** copy, so without `make openapi-gen` the change is invisible at
`/openapi.json` while routing keeps working — a silent drift.
`internal/bootstrap/spec_coverage_test.go` walks the real chi router and fails
if any registered route is missing from the embedded spec, which catches both
"forgot the yaml" and "forgot to regenerate".

Browse `http://localhost:8080/docs` for the Scalar explorer.

## Configuration

All env vars are prefixed `GATEWAY_`. Defaults shown.

| Var | Default | Purpose |
| --- | --- | --- |
| `GATEWAY_HTTP_ADDR` | `:8080` | Public listener |
| `GATEWAY_CATALOG_GRPC_ADDR` | `catalog:9001` | catalog-service backend |
| `GATEWAY_MESH_GRPC_ADDR` | `mesh-api:9002` | mesh-api backend |
| `GATEWAY_UPLOAD_GRPC_ADDR` | `upload:9003` | upload-service backend |
| `GATEWAY_AUTH_GRPC_ADDR` | `auth:9004` | auth-service backend |
| `GATEWAY_ASSET_HTTP_ADDR` | `http://asset:8081` | asset-service for blob proxy |
| `GATEWAY_ALLOWED_ORIGINS` | *(empty)* | CORS allow-list. Empty means the CORS handler is **not mounted at all** — the SPA is same-origin and needs none. Do not try to disable CORS by passing an empty list to go-chi/cors: it reads that as *all* origins. |
| `GATEWAY_CSRF_SECRET` | — | **Required**, no default. HMAC key behind the anti-CSRF token. A hardcoded default would be public and a per-boot random one would invalidate every outstanding token on restart, so the service refuses to boot without it. |
| `GATEWAY_COOKIE_SECURE` | `true` | Mark `andrey_session` `Secure`. Default is the safe one so a misconfigured production fails closed; local compose sets `false` because dev is plain http, where a `Secure` cookie is simply never sent. |
| `GATEWAY_SESSION_COOKIE_TTL` | `720h` | `Max-Age` of the session cookie. Should not exceed auth's absolute session TTL — exceeding it only costs the user a doomed round trip before the 401. |
| `GATEWAY_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `GATEWAY_LOG_FORMAT` | `json` | `json` / `text` |
| `GATEWAY_READ_TIMEOUT` | `10s` | HTTP read timeout |
| `GATEWAY_WRITE_TIMEOUT` | `5m` | HTTP write timeout (large GLB streams) |
| `GATEWAY_IDLE_TIMEOUT` | `2m` | HTTP idle timeout |
| `GATEWAY_SHUTDOWN_TIMEOUT` | `15s` | Graceful drain window on SIGTERM |

`Validate()` fails fast if any of the catalog / mesh / upload / auth gRPC
addresses or the asset HTTP address is empty.

## Run locally

From the `backend/` root:

```bash
make build
./bin/gateway --http-addr :8080 \
              --catalog-grpc-addr localhost:9001 \
              --mesh-grpc-addr localhost:9002 \
              --upload-grpc-addr localhost:9003 \
              --auth-grpc-addr localhost:9004 \
              --asset-http-addr http://localhost:8081
```

Or via Compose: `make compose-up` exposes `:8080` on the host. Browse
`http://localhost:8080/docs` for the API explorer.

## Regenerating server stubs

The OpenAPI spec is the source of truth — server stubs and the embedded spec
are regenerated from it via `oapi-codegen` (both passes):

```bash
make openapi-gen
```

## Tests / lint

```bash
make test    # go test -race -shuffle=on ./...
make lint    # golangci-lint
```

Tests use `testify/suite` for grouping and `gotest.tools/v3/assert` for
assertions (the project-wide convention).

## Toolchain & dependencies

Go **1.26.5** — `go 1.26.5` in `go.mod`, build stage `golang:1.26.5-alpine`.
Versions are pinned identically across every module in the workspace; see
[`backend/README.md#toolchain--dependencies`](../../README.md#toolchain--dependencies)
for the repo-wide matrix and the upgrade procedure.

| Module | Version | Role |
| --- | --- | --- |
| `github.com/andybalholm/brotli` | v1.2.2 | Brotli response compression |
| `github.com/getkin/kin-openapi` | v0.145.0 | OpenAPI 3 spec load + request validation |
| `github.com/go-chi/chi/v5` | v5.3.1 | HTTP router |
| `github.com/go-chi/cors` | v1.2.2 | CORS middleware |
| `github.com/gojuno/minimock/v3` | v3.4.7 | Generated interface mocks (test) |
| `github.com/oapi-codegen/runtime` | v1.6.0 | Runtime for the generated server stubs |
| `github.com/samber/slog-chi` | v1.19.1 | slog request-logging middleware |
| `github.com/spf13/cobra` | v1.10.2 | CLI root command / flag definitions |
| `github.com/spf13/viper` | v1.21.0 | Layered config (flag > env > default) |
| `github.com/stretchr/testify` | v1.11.1 | `suite` grouping only (test) |
| `github.com/vbncursed/rosneft/backend/pkg` | v0.0.0 | Workspace module — shared libs (`replace` → `../../pkg`) |
| `github.com/vbncursed/rosneft/backend/proto` | v0.0.0 | Workspace module — generated gRPC stubs (`replace` → `../../proto`) |
| `golang.org/x/sync` | v0.22.0 | `errgroup` — parallel scene-bundle fan-out |
| `google.golang.org/grpc` | v1.82.1 | gRPC transport |
| `gotest.tools/v3` | v3.5.2 | `assert` — the actual assertions (test) |
