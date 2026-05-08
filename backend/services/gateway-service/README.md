# gateway-service

Public HTTP edge of the Andrey backend. Translates `/api/*` REST calls into
gRPC requests against `catalog` and `mesh-api`, proxies binary asset traffic
to `asset`, streams conversion progress over SSE, and serves the OpenAPI
spec + Scalar UI for human/agent discovery.

This is the only backend service exposed on the host network; everything else
binds to the internal Compose network only.

## Responsibilities

- REST → gRPC mapping for catalog (projects, artifacts, placements) and mesh
  (`POST /api/projects/{slug}/convert`, `GET /api/projects/{slug}/jobs/{id}`).
- **Scene bundle** aggregator: `GET /api/projects/{slug}/scene` returns
  project + LOD0 artifact (with full LOD chain attached) + placements +
  asset options (each with its own LOD chain) in one round trip
  (errgroup-based parallel fan-out to catalog). The frontend never has to
  follow up with `GetArtifact` to pick a specific LOD — every level is
  already in the bundle.
- **SSE conversion stream**: `GET /api/jobs/{id}/events` pushes job state
  changes in real time, replacing client-side polling.
- **Pagination** on `/api/projects` via `?limit=&cursor=` query params plus
  the `X-Next-Cursor` response header.
- **ETag + 304 Not Modified** on all GET JSON endpoints.
- **Brotli / gzip** compression negotiated via `Accept-Encoding` (br
  preferred); applied to JSON only, binary blob proxy bypasses.
- HTTP reverse-proxy of `/blobs/*` → asset-service, preserving immutable
  `Cache-Control` headers from the upstream.
- CORS, request logging, OpenAPI/Scalar UI mounting.

## Layout

```
internal/
  bootstrap/   # wires config → clients → server, owns os.Args/env
  config/      # Viper layered config, GATEWAY_* env vars
  domain/      # shared types and errors (Project, Artifact, Placement,
               # SceneBundle, AssetOption, ProjectPage, Job)
  service/     # one file = one method
               # gateway.go: Catalog/Mesh interfaces + Gateway struct + ctor
               # get_scene_bundle.go, build_asset_options.go,
               # list_projects_page.go, list_projects.go, …
  clients/
    catalog/   # gRPC client for catalog-service (one method per file)
    mesh/      # gRPC client for mesh-api (one method per file)
  transport/
    httpapi/   # HTTP handlers (one file per route) + middlewares
               # etag_middleware.go, compress_middleware.go
               # watch_job_events.go (SSE)
    proxy/     # asset-service reverse proxy
api/
  openapi.yaml # source of truth for the public API
  oapi-codegen.yaml
```

## API summary

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/projects` | List projects (`?limit=&cursor=`, header `X-Next-Cursor`) |
| GET | `/api/projects/{slug}` | One project |
| GET | `/api/projects/{slug}/scene` | **Bundle: project + LOD0 + placements + asset options** |
| GET | `/api/projects/{slug}/artifacts` | List artifacts (all LODs) |
| GET | `/api/projects/{slug}/artifacts/{lod}` | Specific LOD |
| POST | `/api/projects/{slug}/convert` | Submit conversion job |
| GET | `/api/jobs/{id}` | Job status snapshot |
| GET | `/api/jobs/{id}/events` | **SSE stream of job state changes** |
| GET, POST, PUT, DELETE | `/api/projects/{slug}/placements/{id}` | Placement CRUD |
| GET | `/api/assets/{hash}` | Binary GLB (proxied to asset-service) |
| GET | `/docs` | Scalar UI |
| GET | `/openapi.json` | Machine-readable spec |

## Middleware chain

```
client → CORS → /api/...
                  ├── /api/assets/{hash}    → bypass middlewares → asset proxy (binary)
                  ├── /api/jobs/{id}/events → bypass middlewares → SSE handler
                  └── (everything else)     → ETag → Compression → openapi handlers
```

The asset proxy is excluded so binary GLBs aren't re-compressed (they are
already Draco/KTX2-compressed). The SSE handler is excluded so the body
isn't buffered or transformed mid-stream.

## Configuration

All env vars are prefixed `GATEWAY_`. Defaults shown.

| Var | Default | Purpose |
| --- | --- | --- |
| `GATEWAY_HTTP_ADDR` | `:8080` | Public listener |
| `GATEWAY_CATALOG_GRPC_ADDR` | `catalog:9001` | catalog-service backend |
| `GATEWAY_MESH_GRPC_ADDR` | `mesh-api:9002` | mesh-api backend |
| `GATEWAY_ASSET_HTTP_ADDR` | `http://asset:8081` | asset-service for blob proxy |
| `GATEWAY_ALLOWED_ORIGINS` | `*` | CORS allow-list |
| `GATEWAY_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `GATEWAY_LOG_FORMAT` | `json` | `json` / `text` |
| `GATEWAY_READ_TIMEOUT` | `10s` | HTTP read timeout |
| `GATEWAY_WRITE_TIMEOUT` | `5m` | HTTP write timeout (large GLB streams) |
| `GATEWAY_IDLE_TIMEOUT` | `2m` | HTTP idle timeout |
| `GATEWAY_SHUTDOWN_TIMEOUT` | `15s` | Graceful drain window on SIGTERM |

## Run locally

From the `backend/` root:

```bash
make build
./bin/gateway --http-addr :8080 \
              --catalog-grpc-addr localhost:9001 \
              --mesh-grpc-addr localhost:9002 \
              --asset-http-addr http://localhost:8081
```

Or via Compose: `make compose-up` exposes `:8080` on the host. Browse
`http://localhost:8080/docs` for the API explorer.

## Regenerating server stubs

The OpenAPI spec is the source of truth — server stubs are regenerated from
it via `oapi-codegen`:

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
