# asset-service

Internal HTTP file server for content-addressed GLB blobs. Read-only from
the worker's perspective once a blob is written: filenames are SHA-256
digests so the URL → bytes mapping is immutable and safe to cache forever.

`asset` is **not** exposed on the host — gateway reverse-proxies
`/api/assets/{hash}` to it as `/assets/{hash}` internally over the Compose
network. The browser never talks to `asset` directly.

## HTTP routes

| Method     | Path             | Description                                  | Response headers |
| ---        | ---              | ---                                          | --- |
| `GET`      | `/assets/{hash}` | Streams the blob bytes from disk (Range-aware via `http.ServeContent`). | `Content-Type` (from blob, e.g. `model/gltf-binary`), `Cache-Control: public, max-age=31536000, immutable`, `ETag: "<full SHA-256>"`; `Accept-Ranges`/`Content-Range` on Range requests |
| `HEAD`     | `/assets/{hash}` | Same headers as `GET` plus `Content-Length`, no body. | `Content-Type`, `Cache-Control`, `ETag`, `Content-Length` |
| `GET`      | `/healthz`       | Liveness probe — always `200 {"status":"ok",…}`. | JSON |
| `GET`      | `/readyz`        | Readiness probe — `200` once ready, else `503 not_ready`. | JSON |

Behaviour notes for `/assets/{hash}`:

- Conditional `If-None-Match` matching the ETag → `304 Not Modified`.
- Unknown hash → `404 Not Found`; malformed hash (non-hex, traversal, …) is
  rejected by BlobStore as `400 Bad Request`.
- The strong `ETag` is the quoted blob hash — the hash **is** the cache key,
  so differing bytes always imply a different hash and a different ETag.

## Layout

```
cmd/asset/            # Cobra entrypoint → bootstrap.RunServe
internal/
  bootstrap/          # config → blobstore → service → http mux/serve
  config/             # Viper layered config, ASSET_* env vars
  service/            # Asset service: Stat / Get over BlobStore
  transport/httpapi/  # one file per HTTP route; handler.go has the constructor + mux mount
```

## Configuration

All env vars are prefixed `ASSET_`. Defaults shown.

| Var | Default | Purpose |
| --- | --- | --- |
| `ASSET_HTTP_ADDR` | `:8081` | HTTP listener (internal) |
| `ASSET_BLOB_DIR` | *(required)* | BlobStore root, read-only (must match `MESH_BLOB_DIR`; `/var/blob` in Compose) |
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

Or via Compose: `make compose-up`. The container mounts the shared
`blob-data` volume at `/var/blob` **read-only** — mesh-worker and upload write
it, asset only reads.

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
