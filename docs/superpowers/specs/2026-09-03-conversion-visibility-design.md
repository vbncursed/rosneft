# Conversion visibility — design

**Status:** Step 1 implemented 2026-09-04 (plan
`docs/superpowers/plans/2026-09-04-conversion-visibility.md`); Step 2 not built.

## Problem

The admin console's Content screen lists every territory and model and wants
to say which of them are converting, which failed, and to update as the
worker moves. Today it cannot:

- The only job read is `GetJob(id)` (`proto/rosneft/mesh/v1/mesh.proto`).
  Jobs live in Redis hashes keyed by id (`andrey:mesh:job:{id}`,
  `services/mesh-service/internal/storage/save_job.go`) with no index by
  target, no list, no TTL. Nothing can answer "what is happening to
  territory X" without already holding a job id.
- A job id reaches a client only in the response to `POST /api/territories`,
  `POST /api/models` and `POST …/source`. frontend-v2 has none of those (upload
  lives in the old SPA), and the reconciler
  (`services/mesh-service/internal/bootstrap/run_worker.go`, 5-minute tick)
  starts jobs nobody's browser ever hears about.
- The one push channel, `GET /api/jobs/{id}/events`
  (`services/gateway-service/internal/transport/httpapi/watch_job_events.go`),
  is one goroutine per subscriber polling mesh-api once a second for one id.
  It is mounted behind `Authenticate` only, by a documented decision (a job id
  is 128 random bits), so it is not the shape a catalog-wide feed can take.
- There is no Pub/Sub, no keyspace notification and no server-streaming RPC
  anywhere in the repository; the gateway has no Redis client at all.

So Part 3 shows `ready` (artifacts exist) and `pending` (none) — honest, but
a failed conversion looks exactly like one that has not started, and a
running one looks like nothing is happening.

## What is being built

Two steps, the second optional.

### Step 1 — a job per target, readable in one call

**mesh-service.** `SaveJob` additionally writes the job id into one hash,
`andrey:mesh:targets`, field `{kind}:{slug}` — the *latest* job for that
target, whatever its status. One `HSET` beside the existing one; no new TTL
semantics (job hashes already live forever). A new unary RPC:

```proto
// ListTargetJobs returns the latest job of every target that has one.
rpc ListTargetJobs(ListTargetJobsRequest) returns (ListTargetJobsResponse);
message ListTargetJobsRequest {}
message ListTargetJobsResponse { repeated Job jobs = 1; }
```

implemented as `HGETALL andrey:mesh:targets` followed by a pipelined
`HGETALL` per job id. The set is bounded by the catalog size (tens), not by
job history. Existing jobs predate the index; a one-off backfill is not
worth writing — the next `SaveJob` for a target indexes it, and the reconciler
touches every unconverted target within a tick.

**gateway-service.** `GET /api/jobs` → `200 Job[]`: the latest job per
target, **tenant-filtered**: territories are kept only when their slug is in
`ListTerritories(ctx, scopeAdminID)` (the same visibility the list itself
has; Root passes everything), models are kept for everyone (the library is
shared by decision). Succeeded jobs are dropped from the answer: the artifacts
already say "ready", and the console must not print a stale "succeeded" for a
territory whose source was since replaced. Behind `Authenticate`; no
permission entry — it reveals nothing the catalog lists do not.

**frontend-v2.** `useContent` adds one query, `jobsQuery` (`["jobs"]`), and
`toContentItem` takes the target's job: `converting` when pending/running
(with `progress` and `stage`), `failed` (with `errorMessage` in the inspector),
else the artifacts rule as today. While any row is converting the query
polls (`refetchInterval` 5 s, off when the tab is hidden) and re-fetches that
row's artifacts on the transition to done. That is the whole of the live
behaviour Step 1 gives: one small request every five seconds while something
is actually running, nothing otherwise.

### Step 2 — a catalog-wide stream (only if polling proves insufficient)

**mesh-service** publishes every `SaveJob` on a Redis channel,
`andrey:mesh:job-events`, as the same JSON the API returns. **mesh-api** gains
a server-streaming RPC `WatchJobs(WatchJobsRequest) returns (stream Job)`
backed by that subscription. **gateway-service** holds one upstream
`WatchJobs` stream and a broadcaster; `GET /api/jobs/events` is SSE
(`event: job`, keepalive 15 s, mounted outside ETag/compression like the
per-id route) with the **same tenant filter as `GET /api/jobs`**, evaluated
per subscriber against the visible-slug set captured at subscribe time and
refreshed when a `territory.insert`/`delete` would change it (simplest: every
60 s). A client that reconnects re-reads `GET /api/jobs` for the snapshot;
no `Last-Event-ID` replay.

The frontend swaps the poll for the stream and keeps the poll as the fallback
when `EventSource` errors.

Step 2 is deliberately not in the first pass. A console that is open shows
tens of rows and polls once every five seconds; a stream saves that request
and gives sub-second latency on a state that changes at coarse stage
boundaries. Build it when someone is watching conversions in the console
often enough to feel the five seconds.

## Alternatives considered

- **WebSocket instead of SSE.** Same push capability; worse fit here. The
  session is an httpOnly cookie on a single origin and `EventSource` carries
  it with no work; a WebSocket upgrade needs its own path past chi's
  middleware, an Origin check on the handshake (cross-site WebSocket
  hijacking), nginx `Upgrade` config, and tunnelling code in the desktop
  shell's loopback proxy (`desktop/`, reqwest streams HTTP but not WebSocket).
  The client never sends anything back. SSE already exists in the gateway and
  in nginx (`X-Accel-Buffering: no`).
- **Kafka.** The queue is already Redis Streams with consumer groups and acks
  (`consume_jobs.go`, `ack_job.go`); loss of the in-memory queue is recovered
  by the reconciler, which re-finds unconverted targets from the catalog.
  Kafka would add a broker, a client in two services, topics, retention and
  monitoring, and still need the gateway's SSE layer with the tenant filter
  in front of the browser. Justified only when independent consumers need
  to replay event history — none exist. Not doing it; if that day comes it
  slots in behind mesh-service without the gateway or the frontend noticing.
- **Gateway subscribes to Redis directly.** Fewer moving parts than
  `WatchJobs`, but the gateway would gain a Redis dependency and couple to
  mesh-service's key layout. Every other cross-service read goes through
  gRPC; keep it that way.
- **Embed the job in `GET /api/territories` / `GET /api/models`.** Saves the
  console one request, but changes the ETag and the cost of a list every
  viewer client reads, and forces catalog-service to know mesh. A separate
  `GET /api/jobs` keeps the catalog contract untouched.
- **N calls to a per-slug `GET …/{slug}/job`.** The console would fan out
  ~40 requests again; one list call is the point.

## Things found on the way, not fixed here

- The Content screen fetches artifacts per row (`GET /api/{territories,models}/{slug}/artifacts`, ~40 requests on the dev fixture) and is "loading" until every one answers. Right at tens of rows, wrong at hundreds. `GET /api/jobs` is the natural place to also carry a per-target artifact summary (`lodCount`, `totalSize`), or a separate `GET /api/artifacts?kind=…` list — decide when this endpoint is designed, not after.

- `SubmitConversion` does not take the reconciler's target lock
  (`submit_conversion.go`), so a user-initiated job and a reconciler job for
  the same target can run concurrently. The target index makes "latest wins"
  explicit but does not prevent the race — and with two jobs in flight the
  older one's terminal write can land last, so the index (and the console)
  briefly reports "succeeded"/"failed" for a target still converting. Separate fix: `SubmitConversion`
  refuses (or returns the running job) while `andrey:mesh:inflight:{kind}:{slug}`
  is held.
- `GET /api/jobs/{id}/events` is not tenant-scoped. With a target index the
  gateway could check the job's slug against the caller's visible set at
  subscribe time; cheap, and worth doing in Step 1 while the filter is being
  written.
- `streamJob` has no test. Step 2 must add one before generalising it.

- Index entries are never removed: deleting a territory or model leaves its
  `{kind}:{slug}` field in `andrey:mesh:targets`, and a last `failed` job stays
  in `GET /api/jobs` for Root as a phantom row. `HDEL` on catalog delete (or a
  reconciler sweep) closes it; bounded by catalog churn today.
- Ruling 7 of the plan ("a jobs failure is a screen failure") takes the whole
  Content screen down during a mesh outage although every catalog query
  answered. Revisit before the pattern reaches Audit/Metrics: a banner with
  conversion state suppressed avoids the confident wrong "pending" just as well.
- When v2 gains an upload or replace-source flow, that mutation must
  invalidate `["jobs"]` — polling arms only on an answer that already holds a
  live job.

## Testing

- mesh-service: service-layer test with `QueueMock` that `SaveJob` indexes
  the target and `ListTargetJobs` returns the latest job per target; the
  first Redis-backed integration test for the storage (testcontainers,
  `-tags=integration`, mirroring the Postgres suites) — the index and the
  pipelined read are storage behaviour a mock cannot prove.
- gateway: `GET /api/jobs` through `router().oneshot()`-style tests with a
  stubbed mesh client: Root sees all, a scoped caller sees only their
  territories' jobs plus every model's, succeeded jobs are absent. The filter
  is a pure function over `(jobs, visibleSlugs, allAccess)` with its own test,
  and the route test proves the handler calls it with the right input — both
  levels, per the desktop shell's lesson.
- frontend-v2: `toContentItem` with a job argument; `useContent` polls while
  converting and stops when nothing is.

## Order of work

1. mesh-service index + RPC (S).
2. gateway `GET /api/jobs` with the tenant filter (S–M); scope the per-id SSE
   while there (S).
3. frontend-v2: `jobsQuery`, `converting`/`failed` rows, the inspector's error
   row, polling (S). This is the first thing that makes Part 3's `pending`
   split into the three states the mock drew.
4. Step 2 stream — deferred until asked for.
