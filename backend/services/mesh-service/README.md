# mesh-service

OBJ → GLB conversion pipeline backed by Redis Streams. Ships **two binaries**
from the same module:

- **`mesh-api`** — gRPC façade for `SubmitConversion` / `GetJob`. Writes job
  rows + enqueues to the Redis stream.
- **`mesh-worker`** — long-running consumer that reads the stream, parses
  OBJ + MTL + textures, builds a glTF, then runs an optional `gltfpack`
  post-process pass:
  - **Draco mesh compression** (`KHR_draco_mesh_compression`) — default on
  - **KTX2 / Basis Universal textures** (`KHR_texture_basisu`) — opt-in
  - **LOD generation** — opt-in via `MESH_LOD_RATIOS`
  Persists the GLB to the shared BlobStore, registers the artifact in
  catalog. Also runs an in-process reconciler that auto-queues projects
  whose GLB is missing.

## Layout

```
internal/
  bootstrap/      # config → clients → server/worker (one file per dependency)
  config/         # Viper layered config, MESH_* env vars
  domain/         # Project, Artifact, Job, Vec3, ConversionResult, errors
  storage/        # Redis Streams + job table; redis.go owns the connection,
                  # one method per file (enqueue_job.go, save_job.go, …)
  catalog/        # gRPC client to catalog-service (one method per file)
  service/        # mesh.go has the storage/catalog/converter/blobs interfaces
                  # + constructor; one method per file (submit_conversion.go, …)
  transport/      # gRPC handlers (one file per RPC)
  worker/         # consume loop wiring service.ProcessJob into the stream
  converter/      # parse_obj.go, parse_mtl.go, normalize.go, write_glb.go,
                  # compress_step.go, convert_lods.go (LOD fan-out)
  compression/    # gltfpack-backed Optimizer
                  # compression.go: Compressor interface + Optimizer struct +
                  #   functional options (WithDraco, WithKTX2)
                  # compress.go: Compress(ctx, glb) — Draco + KTX2 pass
                  # simplify.go: Simplify(ctx, glb, ratio) — LOD pass
                  # available.go: startup preflight against gltfpack binary
```

## Conversion pipeline

1. Frontend → `POST /api/projects/{slug}/convert` → gateway → `mesh-api.SubmitConversion`.
2. `mesh-api` writes a job row + entry to the Redis stream.
3. `mesh-worker` consumes:
   - Loads `Project` from catalog → resolves `SourceObjPath` against `MESH_SOURCE_DIR`.
   - Streaming OBJ parser (positions, UVs, faces, fan-triangulation, Z-up→Y-up,
     V-flip, `usemtl` grouping) → dedup `(v_idx, vt_idx)` pairs.
   - MTL parser (`Kd`, `d`/`Tr`, `map_Kd`) → per-material glTF primitive sharing
     one position/UV buffer; PBR baseColorFactor + optional baseColorTexture.
   - Texture cache deduplicates images shared across materials.
   - Normalize (center, scale to maxDim=2). Emit GLB.
   - **Draco compression** + **KTX2** via `gltfpack -cc -tc` (when enabled).
   - **LOD fan-out** — for each ratio in `MESH_LOD_RATIOS`, run
     `gltfpack -si <ratio>` on the LOD0 GLB to produce LOD1, LOD2, …
4. Worker writes each LOD GLB to BlobStore (content-addressed, SHA-256 filename)
   and registers each as a separate `Artifact{LOD: N}` in catalog.
5. Reconciler (5-min ticker) lists catalog projects, queues conversions for
   any whose LOD0 GLB is missing.

## Optional optimisations

All three are opt-in via env vars. The frontend must have the matching
loader/decoder configured before enabling each.

| Optimisation | Flag | Frontend requirement |
| --- | --- | --- |
| Draco | `MESH_DRACO_ENABLED=true` (default) | `DRACOLoader` registered (already wired in viewer) |
| KTX2 / Basis | `MESH_KTX2_ENABLED=true` (default) | `KTX2Loader` registered explicitly via `useGLTF.setKTX2Loader(...)` — drei does NOT auto-register it |
| LOD | `MESH_LOD_RATIOS=0.5,0.25` (default) | Use `getArtifact(slug, lod)` per level, or drei `<Detailed>`. Frontend without LOD support keeps using LOD0 — additional LODs are simply unused. |

When all three are off, the worker emits raw GLB and registers a single
LOD0 artifact — backwards-compatible with frontends that have no decoders.

## Configuration

All env vars are prefixed `MESH_`. Defaults shown.

| Var | Default | Purpose | Used by |
| --- | --- | --- | --- |
| `MESH_GRPC_ADDR` | `:9002` | gRPC listener | `mesh-api` |
| `MESH_REDIS_ADDR` | `redis:6379` | Redis Streams backend | both |
| `MESH_REDIS_DB` | `0` | Redis DB number | both |
| `MESH_CATALOG_GRPC_ADDR` | `catalog:9001` | catalog-service backend | `mesh-worker` |
| `MESH_BLOB_DIR` | *(required)* | BlobStore root | `mesh-worker` |
| `MESH_SOURCE_DIR` | *(required)* | Root for `SourceObjPath` | `mesh-worker` |
| `MESH_WORKER_NAME` | `mesh-worker-1` | Consumer-group instance | `mesh-worker` |
| `MESH_BLOCK_TIMEOUT` | `5s` | XREADGROUP block | `mesh-worker` |
| `MESH_MAX_CONCURRENT_JOBS` | `0` | `0` → `GOMAXPROCS` | `mesh-worker` |
| `MESH_DRACO_ENABLED` | `true` | KHR_draco_mesh_compression | `mesh-worker` |
| `MESH_KTX2_ENABLED` | `true` | KHR_texture_basisu (frontend KTX2Loader required) | `mesh-worker` |
| `MESH_DRACO_BIN` | `gltfpack` | Path/name of gltfpack binary | `mesh-worker` |
| `MESH_LOD_RATIOS` | `0.5,0.25` | Comma-separated simplify ratios for extra LODs (LOD0 always = full quality) | `mesh-worker` |
| `MESH_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` | both |
| `MESH_LOG_FORMAT` | `json` | `json` / `text` | both |
| `MESH_SHUTDOWN_TIMEOUT` | `30s` | Graceful drain | both |

## Run locally

Redis required:

```bash
docker run -d --name redis -p 6379:6379 redis:8
```

Then from `backend/`:

```bash
make build

./bin/mesh-api  --grpc-addr :9002 --redis-addr localhost:6379

./bin/mesh-worker \
  --redis-addr localhost:6379 \
  --catalog-grpc-addr localhost:9001 \
  --blob-dir   $(pwd)/data/blob \
  --source-dir $(pwd)/data/source \
  --draco-enabled=true \
  --ktx2-enabled=true \
  --lod-ratios=0.5,0.25
```

For local Draco/KTX2/LOD encoding install gltfpack: build it from
`zeux/meshoptimizer` (CMake target `gltfpack`) or grab a release binary
from <https://github.com/zeux/meshoptimizer/releases>. The Compose image
builds it from source. To skip post-processing locally, run with
`--draco-enabled=false --ktx2-enabled=false` and an empty `--lod-ratios`.

## Tests / benchmarks

```bash
make test
go test -bench=. -benchmem ./internal/converter/
```

OBJ parser benchmarks: ~5 allocs/op, ~260–330 MB/s on Apple M3.
