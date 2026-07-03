# Andrey 3D Viewer

Browser-native 3D viewer for very large OBJ models. Heavy work — OBJ parsing,
multi-material GLB conversion (with Draco compression, KTX2 textures, and
LOD generation), texture optimisation, blob storage — happens server-side so
the browser fetches compact binary artifacts instead of 100+ MB ASCII files.

## Repository layout

```
andrey/
├── backend/        # Go 1.26 microservices (gateway, catalog, content, auth, twofa, mesh, upload, asset)
├── frontend/       # Next.js 16 + React 19 viewer (RSC + react-three-fiber)
├── documentation/  # external reference material checked in for offline use
├── CLAUDE.md       # repo-wide guidance for Claude Code
└── AGENTS.md       # agent collaboration rules
```

Each top-level package owns its own toolchain, build, and README.

## Components

### Frontend (`frontend/`)

Next.js 16 App Router under `src/app/`, React 19, Tailwind v4. Clean
Architecture + DDD layout under `src/<context>/{domain,application,
infrastructure,presentation}/` with bounded contexts `catalog`,
`placement`, `viewer`, plus `shared`. Renders converted GLBs through
`@react-three/fiber`/`@react-three/drei`, exposes an in-scene gizmo
(translate/rotate/scale), placement editor and measurement tool.
Self-hosts the DRACOLoader decoder under `public/draco/`.

See [`frontend/README.md`](frontend/README.md).

### Backend (`backend/`)

Go 1.26 multi-module workspace (`go.work`). Services:

| Service           | Purpose                                                       | Network            |
| ----------------- | ------------------------------------------------------------- | ------------------ |
| [`gateway-service`](backend/services/gateway-service/README.md) | REST + OpenAPI + scene bundle + SSE + auth middleware + ETag/Brotli | `:8080` (external)        |
| [`catalog-service`](backend/services/catalog-service/README.md) | Territory / model / artifact / placement registry             | gRPC `:9001` (internal)   |
| [`content-service`](backend/services/content-service/README.md) | Documents + panoramas anchored to a territory                 | gRPC `:9007` (internal)   |
| [`auth-service`](backend/services/auth-service/README.md)       | Users, multi-role RBAC, sessions                              | gRPC `:9004` (internal)   |
| [`twofa-service`](backend/services/twofa-service/README.md)     | TOTP 2FA: secrets, recovery codes, verify                     | gRPC `:9006` (internal)   |
| [`mesh-service`](backend/services/mesh-service/README.md)       | OBJ → GLB + Draco + KTX2 + LOD (`mesh-api` + `mesh-worker`)   | gRPC `:9002` (internal)   |
| [`upload-service`](backend/services/upload-service/README.md)   | Resumable chunked uploads (gRPC streaming)                    | gRPC `:9003` (internal)   |
| [`asset-service`](backend/services/asset-service/README.md)     | Binary artifact server (Range / ETag / immutable cache)       | `:8081` (via gw)          |

Persistence: PostgreSQL 17 + Redis 8 Streams + local FS blob store
(S3-ready behind `BlobStore`). The mesh-worker container ships `gltfpack`
(built from `zeux/meshoptimizer`) for Draco / KTX2 / LOD encoding.

See [`backend/README.md`](backend/README.md).

## Frontend ↔ backend performance features

Implemented across both sides; some are opt-in until both halves are wired:

| Feature | Backend | Frontend requirement |
| --- | --- | --- |
| Single-shot scene bundle | `GET /api/projects/{slug}/scene` | Use it instead of 4 parallel calls |
| SSE conversion stream | `GET /api/jobs/{id}/events` | Replace polling with `EventSource` |
| Project pagination | `?limit=&cursor=` + `X-Next-Cursor` | Send params when listing |
| ETag + 304 on JSON | always-on middleware | nothing — browsers handle automatically |
| Brotli/gzip JSON | always-on middleware | nothing — browsers handle automatically |
| Asset immutable cache | always-on middleware | nothing — browsers handle automatically |
| Draco mesh compression | `MESH_DRACO_ENABLED=true` (default) | `useGLTF.setDecoderPath("/draco/")` ✅ wired |
| KTX2 / Basis textures | `MESH_KTX2_ENABLED=true` (default) | Register `KTX2Loader` explicitly (drei does NOT auto-register) |
| LOD generation | `MESH_LOD_RATIOS=0.5,0.25` (default) | Use `getArtifact(slug, lod)` per level (LOD0 always = full quality) |

## Development

Frontend and backend run independently.

```bash
# Backend (from backend/)
make compose-up      # docker compose: postgres, redis, all services

# Frontend (from frontend/)
yarn dev             # http://localhost:3000 — proxies /api/* to gateway
```

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
  Vitest on the frontend.
- **Cross-service contracts**: protobuf for internal gRPC, OpenAPI 3.1 for
  the gateway; both schemas generate code on each side (`oapi-codegen` for
  Go, `openapi-typescript` for the frontend).
