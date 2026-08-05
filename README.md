# Andrey 3D Viewer

Browser-native 3D viewer for very large OBJ models. Heavy work — OBJ parsing,
multi-material GLB conversion (with Draco compression, KTX2 textures, and
LOD generation), texture optimisation, blob storage — happens server-side so
the browser fetches compact binary artifacts instead of 100+ MB ASCII files.

## Repository layout

```
andrey/
├── backend/            # Go 1.26.5 microservices (gateway, catalog, content, auth,
│                       #   twofa, passkey, mesh, upload, asset)
├── frontend/           # Vite + React 19 SPA viewer (TanStack Router + react-three-fiber)
├── desktop/            # Tauri v2 desktop shell wrapping the same SPA
├── ops/                # deployment + observability config (Prometheus, …)
├── docs/               # design specs and implementation plans
├── docker-compose.yml  # postgres, redis, every backend service, prometheus
└── CLAUDE.md           # repo-wide guidance for Claude Code
```

Each top-level package owns its own toolchain, build, and README.

## Components

### Frontend (`frontend/`)

Vite + React 19 SPA (TanStack Router in `src/routes/`, TanStack Query),
Tailwind v4. Clean Architecture + DDD layout under
`src/<context>/{domain,application,infrastructure,presentation}/` with
bounded contexts `territory`, `model`, `placement`, `viewer`, `auth`,
plus `shared`. Renders converted GLBs through
`@react-three/fiber`/`@react-three/drei`, exposes an in-scene gizmo
(translate/rotate/scale), placement editor and measurement tool.
Self-hosts the DRACOLoader decoder under `public/draco/`.

See [`frontend/README.md`](frontend/README.md).

### Backend (`backend/`)

Go **1.26.5** multi-module workspace (`go.work`, 12 modules). Services:

| Service           | Purpose                                                       | Network            |
| ----------------- | ------------------------------------------------------------- | ------------------ |
| [`gateway-service`](backend/services/gateway-service/README.md) | REST + OpenAPI + scene bundle + SSE + auth middleware + ETag/Brotli | `:8080` (external)        |
| [`catalog-service`](backend/services/catalog-service/README.md) | Territory / model / artifact / placement registry             | gRPC `:9001` (internal)   |
| [`content-service`](backend/services/content-service/README.md) | Documents + panoramas anchored to a territory                 | gRPC `:9007` (internal)   |
| [`auth-service`](backend/services/auth-service/README.md)       | Users, multi-role RBAC, sessions                              | gRPC `:9004` (internal)   |
| [`twofa-service`](backend/services/twofa-service/README.md)     | TOTP 2FA: secrets, recovery codes, verify                     | gRPC `:9006` (internal)   |
| [`passkey-service`](backend/services/passkey-service/README.md) | WebAuthn passkeys: credentials, ceremonies, assertion verify  | gRPC `:9008` (internal)   |
| [`mesh-service`](backend/services/mesh-service/README.md)       | OBJ → GLB + Draco + KTX2 + LOD (`mesh-api` + `mesh-worker`)   | gRPC `:9002` (internal)   |
| [`upload-service`](backend/services/upload-service/README.md)   | Resumable chunked uploads (gRPC streaming)                    | gRPC `:9003` (internal)   |
| [`asset-service`](backend/services/asset-service/README.md)     | Binary artifact server (Range / ETag / immutable cache)       | `:8081` (via gw)          |
| [`audit-service`](backend/services/audit-service/README.md)     | Append-only journal + capture triggers + checkpoint digests    | gRPC `:9009` (internal)   |

Persistence: PostgreSQL 17 + Redis 8 Streams + local FS blob store
(S3-ready behind `BlobStore`). The mesh-worker container ships `gltfpack`
(built from `zeux/meshoptimizer`) for Draco / KTX2 / LOD encoding.

See [`backend/README.md`](backend/README.md).

### Desktop (`desktop/`)

Tauri v2 wrapper around the same Vite + React SPA — no separate frontend, no
separate build. A loopback axum server inside the Rust process serves the
embedded `frontend/dist` and proxies `/api` to the gateway, reproducing
production's nginx single-origin topology so the frontend needs no
desktop-specific code. Holds the session in the OS keychain (never in the
webview), caches `/api/assets/{hash}` on disk per user under a 5 GB cap, and
replays the last good JSON response when the network is down.

See [`desktop/README.md`](desktop/README.md).

## Frontend ↔ backend performance features

Implemented across both sides; some are opt-in until both halves are wired:

| Feature | Backend | Frontend requirement |
| --- | --- | --- |
| Single-shot scene bundle | `GET /api/territories/{slug}/scene` | Use it instead of 4 parallel calls |
| SSE conversion stream | `GET /api/jobs/{id}/events` | Replace polling with `EventSource` |
| Project pagination | `?limit=&cursor=` + `X-Next-Cursor` | Send params when listing |
| ETag + 304 on JSON | always-on middleware | nothing — browsers handle automatically |
| Brotli/gzip JSON | always-on middleware | nothing — browsers handle automatically |
| Asset immutable cache | always-on middleware | nothing — browsers handle automatically |
| Draco mesh compression | `MESH_DRACO_ENABLED=true` (default) | `useGLTF.setDecoderPath("/draco/")` ✅ wired |
| KTX2 / Basis textures | `MESH_KTX2_ENABLED=true` (default) | Register `KTX2Loader` explicitly (drei does NOT auto-register) |
| LOD generation | `MESH_LOD_RATIOS=0.5,0.25` (default) | Use `getArtifact(slug, lod)` per level (LOD0 always = full quality) |

## Toolchain

| Half | Runtime | Pinned where |
| --- | --- | --- |
| Backend | **Go 1.26.5** | `backend/go.work` + all 11 `go.mod` files; `golang:1.26.5-alpine` in every service Dockerfile |
| Frontend | **Node + Yarn**, Vite 8, React 19, TypeScript strict | `frontend/package.json` |
| Datastores | PostgreSQL 17, Redis 8 | `docker-compose.yml` |

The backend's full pinned-dependency matrix, per-module breakdown, and the
upgrade procedure live in
[`backend/README.md#toolchain--dependencies`](backend/README.md#toolchain--dependencies).

## Development

Frontend and backend run independently.

```bash
# Backend (from backend/)
make compose-up      # docker compose: postgres, redis, prometheus, all services
make build           # binaries to backend/bin/
make test            # go test -race -shuffle=on across all 11 modules
make lint            # golangci-lint across all 11 modules

# Frontend (from frontend/)
yarn dev --port 3000 # set VITE_API_URL to the gateway
```

> The frontend is **not** a compose service — run it locally. Use port **3000**,
> not Vite's default 5173: `PASSKEY_RP_ORIGINS` is pinned to
> `http://localhost:3000`, and a mismatched origin fails every WebAuthn ceremony
> with an opaque client-side `SecurityError` and no server log.

Browse `http://localhost:8080/docs` for the Scalar API explorer.

## Architecture rules (repo-wide)

- **Clean Architecture + DDD**, every file lives in one of `domain/`,
  `application/`, `infrastructure/`, or `presentation/` under a bounded
  context.
- **Hard cap: 200 lines per file** in the frontend (enforced by ESLint);
  the backend enforces a similar discipline through review.
- **No speculative abstractions, no dead code.** Add only what the current
  task requires.
- **Tests**: `testify/suite` + `gotest.tools/v3/assert` on the backend;
  Vitest (`*.spec`) + Node's built-in runner (`*.test`, domain) on the frontend.
- **Cross-service contracts**: protobuf for internal gRPC, OpenAPI 3.1 for
  the gateway; both schemas generate code on each side (`oapi-codegen` for
  Go, `openapi-typescript` for the frontend).
