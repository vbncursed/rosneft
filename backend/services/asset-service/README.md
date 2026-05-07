# asset-service

Internal HTTP file server for content-addressed GLB blobs. Read-only from
the worker's perspective once a blob is written: filenames are SHA-256
digests so the URL → bytes mapping is immutable and safe to cache forever.

`asset` is **not** exposed on the host — gateway proxies traffic to it
internally over the Compose network.

## Responsibilities

- `GET /blobs/{hash}` → streams the GLB from disk with:
  - `Content-Type: model/gltf-binary`
  - `Cache-Control: public, max-age=31536000, immutable`
  - `ETag: "<full SHA-256>"`
  - Conditional `If-None-Match` → `304 Not Modified`.

## Layout

```
internal/
  bootstrap/   # config → blobstore → http server
  config/      # Viper layered config, ASSET_* env vars
  api/         # one file per HTTP route; api.go has the constructor
  domain/      # errors and shared types
```

## Configuration

All env vars are prefixed `ASSET_`. Defaults shown.

| Var | Default | Purpose |
| --- | --- | --- |
| `ASSET_HTTP_ADDR` | `:8081` | HTTP listener (internal) |
| `ASSET_BLOB_DIR` | *(required)* | BlobStore root (must match `MESH_BLOB_DIR`) |
| `ASSET_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `ASSET_LOG_FORMAT` | `json` | `json` / `text` |
| `ASSET_READ_TIMEOUT` | `5s` | HTTP read timeout |
| `ASSET_WRITE_TIMEOUT` | `5m` | HTTP write timeout (large GLBs over slow links) |
| `ASSET_IDLE_TIMEOUT` | `2m` | HTTP idle timeout |
| `ASSET_SHUTDOWN_TIMEOUT` | `15s` | Graceful drain on SIGTERM |

## Run locally

The blob directory must be the same one mesh-worker writes to. From `backend/`:

```bash
make build
./bin/asset --http-addr :8081 --blob-dir $(pwd)/data/blob
```

Or via Compose: `make compose-up`. The container mounts `data/blob` read-only.

## Tests / lint

```bash
make test
make lint
```

## Caching contract

Because filenames are SHA-256 digests, **content for a given URL never
changes** — that is what justifies `immutable`. If you ever need to mutate
existing artefacts, mint a new hash and update the catalog reference; do not
reuse a hash with different bytes.
