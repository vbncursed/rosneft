# upload-service

Internal gRPC service that terminates the resumable chunked-upload protocol and
content-addresses finalized blobs into BlobStore.

`upload` is **not** exposed on the host. The gateway terminates the public
tus-style HTTP chunked protocol (`POST /api/uploads` → `PATCH` → `HEAD` →
`POST .../finalize`) and forwards each operation to upload-service over the
Compose network, addressed `upload:9003`. Chunks travel as a client-streaming
gRPC call.

## Responsibilities

- Terminate the resumable chunked-upload protocol: create a session for an
  expected total size, append bytes at monotonically increasing offsets, report
  the current offset for resumability, and finalize or abort.
- Content-address finalized blobs: on Finalize the session's bytes are streamed
  through SHA-256 and moved into BlobStore under their content hash (lower-case
  hex). The resulting `blobHash` is what the gateway forwards into
  `createTerritory` / `createModel`.

## gRPC API

`service UploadService` (proto: `rosneft/upload/v1/upload.proto`).

| RPC | Request → Response | Streaming | Description |
| --- | --- | --- | --- |
| `Initiate` | `InitiateRequest{size, content_type}` → `InitiateResponse{upload_id}` | unary | Creates a new session for an expected total size and returns a server-minted 128-bit hex `upload_id`. Rejects non-positive sizes and sizes above the `max-upload-bytes` cap before touching disk. |
| `WriteChunk` | `stream WriteChunkRequest{upload_id, offset, data}` → `WriteChunkResponse{offset}` | **client-streaming** | Appends one or more chunks to a session. Every chunk carries the absolute `offset` for idempotency; all chunks in one stream must target the same `upload_id` (switching mid-stream is rejected). Offsets must equal the session's current offset and may not exceed the declared size. Returns the total bytes received so the gateway can drive the tus `Upload-Offset` response. |
| `GetStatus` | `GetStatusRequest{upload_id}` → `GetStatusResponse{offset, size}` | unary | Returns the current offset and declared size for resumability (backs the tus `HEAD`). |
| `Finalize` | `FinalizeRequest{upload_id}` → `FinalizeResponse{blob_hash, size}` | unary | Refuses unless `offset == size`. Streams the session bytes through SHA-256, moves them into BlobStore, deletes the session dir, and returns the content hash + byte size. |
| `Abort` | `AbortRequest{upload_id}` → `AbortResponse{}` | unary | Discards a partial session and deletes its incoming dir without publishing anything. |

### Error mapping

Service sentinels (`domain/errors.go`) translate to gRPC codes in
`grpcapi/server.go`:

- `ErrInvalidInput` / `ErrOffsetMismatch` / `ErrSizeExceeded` → `InvalidArgument`
- `ErrSessionNotFound` → `NotFound`
- everything else → `Internal`

## Storage

- **BlobStore** (`/var/blob`) — the content-addressed blob root, the same named
  Docker volume (`blob-data`) shared with `mesh-worker` (rw) and `asset` (ro).
  upload-service mounts it **rw** and writes each finalized blob keyed by its
  SHA-256 hash.
- **Incoming dir** (`/var/upload/incoming`, volume `upload-incoming`) — one
  subdirectory per active session holding `data.bin` (the partial bytes) and
  `meta.json` (the session metadata: size, offset, content-type, timestamps).
  The whole session directory is removed on **Finalize** and on **Abort**, so
  partial uploads never leak.

Bytes are appended to `data.bin` only when the incoming offset matches the
recorded offset; `meta.json` is rewritten atomically (`.tmp` + rename) after
each successful append.

## Configuration

All env vars are prefixed `UPLOAD_` (flags take precedence). Defaults shown.

| Var | Default | Purpose |
| --- | --- | --- |
| `UPLOAD_GRPC_ADDR` | `:9003` | gRPC listen address (internal) |
| `UPLOAD_BLOB_DIR` | `/var/blob` | BlobStore root (must match `MESH_BLOB_DIR` / `ASSET_BLOB_DIR`); required |
| `UPLOAD_INCOMING_DIR` | `/var/upload/incoming` | Per-session partial-upload state; required |
| `UPLOAD_MAX_UPLOAD_BYTES` | `2147483648` (2 GiB) | Max declared upload size; `0` disables the cap |
| `UPLOAD_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `UPLOAD_LOG_FORMAT` | `json` | `json` / `text` |
| `UPLOAD_SHUTDOWN_TIMEOUT` | `15s` | Graceful drain on SIGTERM |

## Layout

```
cmd/upload/            # Cobra root command; dispatches to bootstrap
internal/
  bootstrap/           # config → blobstore → session store → gRPC server
  config/              # Viper layered config, UPLOAD_* env vars
  domain/              # Session, FinalizedBlob, error sentinels
  service/             # business layer, one method per file
  storage/             # filesystem session manager (incoming dir)
  transport/grpcapi/   # one file per RPC; server.go has the error mapper
```

## Run locally

The blob directory must be the same one mesh-worker writes to and asset reads
from. From `backend/`:

```bash
make build
./bin/upload --grpc-addr :9003 \
  --blob-dir $(pwd)/data/blob \
  --incoming-dir $(pwd)/data/upload-incoming
```

Or via Compose: `make compose-up`.

## Tests / lint

```bash
make test
make lint
```

Service-level coverage lives in `internal/service/*_test.go` against in-memory
fakes — no infrastructure required.
