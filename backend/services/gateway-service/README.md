# gateway-service

Public HTTP edge of the Andrey backend. Translates `/api/*` REST calls into
gRPC requests against `catalog`, `mesh-api`, `upload`, and `auth`, proxies
binary asset traffic to `asset`, terminates the chunked-upload protocol,
streams conversion progress over SSE, and serves the OpenAPI spec + Scalar UI
for human/agent discovery.

This is the only backend service exposed on the host network; everything else
binds to the internal Compose network only.

## Responsibilities

- REST → gRPC mapping for catalog (territories, models, artifacts, placements,
  panoramas), mesh (conversion jobs queued on create / source-replace), upload
  (chunked sessions), and auth (sessions, users, roles, permissions).
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
               # gateway.go: Catalog/Mesh/Upload interfaces + Gateway + ctor
               # get_scene_bundle.go, build_asset_options.go, …
  clients/
    catalog/   # gRPC client for catalog-service (one method per file)
    mesh/      # gRPC client for mesh-api (one method per file)
    upload/    # gRPC client for upload-service
    auth/      # gRPC client for auth-service
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

All `/api/*` routes require a valid Bearer session (see **Auth**), except
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

### Jobs, assets, docs

| Method | Path | Perm | Description |
| --- | --- | --- | --- |
| GET | `/api/jobs/{id}/events` | — | **SSE stream of job state changes** (root router, bypasses JSON chain) |
| GET, HEAD | `/api/assets/{hash}` | — | Binary GLB / panorama image (reverse-proxied to asset-service) |
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
client → CORS → RequestID → RealIP → Recoverer → slog-chi      ← root router
  ├── /healthz, /readyz, /docs, /openapi.json
  ├── /api/assets/{hash}    → asset proxy (binary)   ← bypass JSON middleware
  ├── /api/jobs/{id}/events → SSE handler            ← bypass JSON middleware
  ├── /api/auth/*           → authhttp (login public; self/admin gated)
  └── /api/* group → Authenticate → RequirePermissionForRoute
                   → ETag → Compress(br/gzip/deflate) → openapi strict handlers
```

- **`Authenticate`** (`authhttp/middleware.go`) validates the `Authorization:
  Bearer …` token against auth-service via gRPC and injects the principal
  (user id + permission snapshot) into the request context; a missing or
  invalid token yields 401.
- **`RequirePermissionForRoute`** (`authhttp/route_permissions.go`) matches the
  resolved chi route pattern against a `"METHOD pattern" → permission` table
  (mutations only; reads need just a valid session) and returns 403 if the
  principal lacks the permission. A new mutating route added without a table
  entry is ungated — keep the table in sync.
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
   **excludes the `auth` tag** (`exclude-tags: [auth]`). Auth endpoints can't
   sit under the `/api` group's uniform auth middleware because `login` must be
   public, so they're hand-served by the plain-chi `authhttp` package instead.
2. **`oapi-codegen-spec.yaml`** — emits an `embedded-spec` blob containing the
   **full** spec (every tag, including `auth`) into the binary. `GetSwagger()`
   serves it at `/openapi.json`, so the Scalar UI at `/docs` documents the
   complete surface — auth routes included — even though they're served outside
   the generated server.

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
| `GATEWAY_ALLOWED_ORIGINS` | `*` | CORS allow-list |
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
