# mesh-service

OBJ → GLB conversion pipeline backed by Redis Streams. Ships **two binaries**
from the same module:

- **`mesh-api`** — gRPC façade for `SubmitConversion(kind, slug)` / `GetJob`.
  Writes a Pending job row to Redis + enqueues the job ID on the stream.
- **`mesh-worker`** — long-running consumer that reads the stream, fetches the
  source ZIP archive from BlobStore by hash, extracts it, parses OBJ + MTL +
  textures, builds a glTF, then runs an optional `gltfpack` post-process pass:
  - **Draco mesh compression** (`KHR_draco_mesh_compression`) — default on
  - **KTX2 / Basis Universal textures** (`KHR_texture_basisu`) — default on
  - **LOD generation** — default on via `MESH_LOD_RATIOS`
  Persists each LOD GLB to the shared BlobStore and registers each as an
  artifact in catalog (`territory_artifacts` or `model_artifacts`, chosen by
  the job's `Kind`). Also runs an in-process reconciler that auto-queues any
  territory or model whose LOD0 artifact is missing.

## gRPC API (`mesh-api`)

`service MeshService` (`proto/rosneft/mesh/v1/mesh.proto`) — two RPCs,
implemented in `internal/transport/grpcapi/`:

| RPC | Request → Response | Description |
| --- | --- | --- |
| `SubmitConversion` | `SubmitConversionRequest{kind, slug}` → `SubmitConversionResponse{job}` | Validates `kind` (`KIND_TERRITORY`/`KIND_MODEL`) + `slug`, persists a `JOB_STATUS_PENDING` job, pushes the job ID onto the Redis stream, and returns the job state immediately. Conversion runs asynchronously in `mesh-worker`. |
| `GetJob` | `GetJobRequest{id}` → `GetJobResponse{job}` | Returns the current state of one conversion job. The `Job` carries `status`, `progress` (0..1), `stage`, plus `error_message` when failed and `artifact_hash` (LOD0) when succeeded. The gateway polls this to drive its `/api/jobs/{id}/events` SSE stream. |

`Kind` discriminates only the destination artifact table — the conversion
pipeline is identical for territories and models.

## Layout

```
internal/
  bootstrap/      # config → clients → server/worker (one file per dependency)
  config/         # Viper layered config, MESH_* env vars
  domain/         # Kind, ConversionTarget, Artifact, Job, Vec3,
                  # ConversionResult, errors
  storage/        # Redis Streams + job table; redis.go owns the connection,
                  # one method per file (enqueue_job.go, save_job.go, …)
  catalog/        # gRPC client to catalog-service (get_target.go,
                  # list_targets.go, has_lod0.go, register_artifact.go,
                  # rescale_placements.go — one method per file)
  service/        # mesh.go has the queue/catalog/converter/blobs interfaces
                  # + constructor; one method per file (submit_conversion.go,
                  # process_job.go, reconcile_missing_artifacts.go, …)
  transport/      # grpcapi/ gRPC handlers (one file per RPC)
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

1. Frontend `POST /api/territories` (or `/api/models`) with a `sourceBlobHash`
   → gateway upserts the entity in catalog and calls
   `mesh-api.SubmitConversion(kind, slug)`. (Standalone re-runs also arrive via
   the reconciler.)
2. `mesh-api` writes a Pending job row to Redis + `XADD`s the job ID onto the
   stream `rosneft:mesh:jobs`.
3. `mesh-worker` consumes the stream via consumer group `mesh-workers`
   (`XREADGROUP`, batches of 16, `MESH_BLOCK_TIMEOUT` block):
   - Marks the job Running.
   - Resolves the catalog target (`GetTarget(kind, slug)` → `source_blob_hash`).
   - Fetches the source ZIP from BlobStore by hash, extracts it to a tmp dir
     (preserving layout; skips `__MACOSX/` + AppleDouble `._*` entries), then
     recursively finds the first `.obj`.
   - Streaming OBJ parser (positions, UVs, faces, fan-triangulation, Z-up→Y-up,
     V-flip, `usemtl` grouping) → dedup `(v_idx, vt_idx)` pairs.
   - MTL parser (`Kd`, `d`/`Tr`, `map_Kd`) → per-material glTF primitive sharing
     one position/UV buffer; PBR baseColorFactor + optional baseColorTexture.
   - Texture cache deduplicates images shared across materials.
   - Normalize (center, scale to maxDim=2). Emit GLB.
   - **Draco compression** + **KTX2** via `gltfpack -cc -tc` (when enabled;
     always with `-noq -kn -km -ke`).
   - **LOD fan-out** — for each ratio in `MESH_LOD_RATIOS`, run
     `gltfpack -si <ratio>` on the LOD0 GLB to produce LOD1, LOD2, …. A failed
     LOD pass is logged and skipped — LOD0 still ships.
4. Before publishing, for territories the worker calls
   `RescaleTerritoryPlacements(slug, newMaxAxis)` so existing placements stay
   1:1 with the replacement mesh. This runs **before** the artifacts land so a
   failure leaves LOD0 absent and the reconciler re-runs the whole job (models
   carry no placements → no-op).
5. Worker writes each LOD GLB to BlobStore (content-addressed, SHA-256 filename)
   and `RegisterArtifact`s each as a separate `Artifact{LOD: N}` into
   `territory_artifacts` or `model_artifacts` per `Job.Kind`. The job is marked
   Succeeded with the LOD0 hash. Progress bumps at coarse stages
   (`fetching`→`extracting`→`parsing`→encode→`lod-N`→`registering`).
6. Failed jobs are **not** acked, so another consumer can reclaim them.

### Reconciler

Runs in-process alongside the consume loop (`bootstrap/run_worker.go`). An
initial pass (up to 5 retries with backoff, since catalog gRPC may still be
coming up) plus a **5-minute ticker** (`reconcileTickInterval`). Each pass
`ListTargets` over every territory + model and, for any without a LOD0
artifact (`HasLOD0`), calls `SubmitConversion`. Idempotent — a no-op on a
fully-converted catalog. It is the belt-and-suspenders backstop for
conversions that were never queued or that crashed mid-flight.

## Optional optimisations

All three default **on** and are individually toggleable via env vars. The
frontend must have the matching loader/decoder configured for each enabled
optimisation.

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
| `MESH_REDIS_ADDR` | `redis:6379` | Redis Streams backend (required) | both |
| `MESH_REDIS_DB` | `0` | Redis DB number | both |
| `MESH_CATALOG_GRPC_ADDR` | `catalog:9001` | catalog-service backend (required for worker) | `mesh-worker` |
| `MESH_BLOB_DIR` | *(required)* | BlobStore root (source ZIPs + output GLBs) | `mesh-worker` |
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
  --blob-dir $(pwd)/data/blob \
  --draco-enabled=true \
  --ktx2-enabled=true \
  --lod-ratios=0.5,0.25
```

Source files arrive as content-addressed ZIP blobs in the same `--blob-dir`
(written by upload-service); there is no host-mounted source directory.

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
