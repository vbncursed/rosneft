# Conversion visibility — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the admin console's Content screen shows which territories and models are converting (with progress and stage) and which failed (with the worker's message), and keeps that fresh while a conversion runs — without a browser ever holding a job id.

**Architecture:** Step 1 of the spec only. mesh-service indexes the latest job per target in one Redis hash and exposes it through a new unary RPC; the gateway serves it as `GET /api/jobs`, tenant-filtered by the same visible-territory list the catalog uses, and scopes the existing per-id SSE the same way; frontend-v2 adds one query that polls every 5 s only while something is running and folds the job into each catalog row. The catalog-wide stream (Step 2) is deliberately not built.

**Tech Stack:** Go 1.27 (mesh-service: go-redis v9, minimock, testify suite, gotest.tools; gateway: chi, oapi-codegen strict server, buf for protos), testcontainers-go 0.44 (new: `modules/redis`), React 19 + TanStack Query 5.102 + vitest 4 in frontend-v2.

**Spec:** `docs/superpowers/specs/2026-09-03-conversion-visibility-design.md`.

## Global Constraints

- **Go changes go through `make -C backend check`** before every commit (gofmt, tidy with `GOWORK=off`, vet with `GOWORK=off`, golangci-lint, `go test -race -shuffle=on`, govulncheck). The pre-commit hook runs it; do **not** use `--no-verify` for a commit that touches Go. If the local toolchain needs `CC`/`SDKROOT` overrides (a previous session did), set them in the shell, change no files.
- **Integration tests are opt-in:** `//go:build integration`, run with `go test -tags=integration ./...` from the service module, need Docker. `make check` never runs them.
- **Modern Go idioms** per `modern-go-guidelines:use-modern-go` — run its `list` for each Go file touched.
- **One method per file** in mesh-service (`storage/`, `service/`, `grpcapi/`) — the packages say so in their doc comments.
- **gRPC errors carry a code**: map through the existing `mapError`/`statusByCode`; never return a raw error from a handler.
- **Gateway tenant rule:** a territory is visible to a scoped caller iff `ListTerritories(ctx, scopeAdminID)` lists it; Root (`allAccess`) sees everything; models are visible to everyone; refusal on a territory route is 404, never 403.
- **Fail closed:** a scoped caller with an empty `scopeAdminID` sees an empty list (mirrors `ListTerritories`).
- **`GET /api/jobs` lives on the root router outside the ETag/compress chain** (it polls; `Cache-Control: no-store`), behind `Authenticate` only, under the OpenAPI tag `jobs` (excluded from generated stubs — plain chi handler like `WatchJobEvents`).
- **OpenAPI is the contract:** edit `backend/services/gateway-service/api/openapi.yaml`, run `make -C backend openapi-gen`, then regenerate both frontends' DTOs (`yarn openapi:generate` in `frontend/` and `frontend-v2/`), and both frontends' lint must stay green.
- **frontend-v2 rules:** Feature-Sliced; sibling spec per file; every decision a pure function with a spec; `status` loading while any query pends, unavailable only with no data (`shared/lib/unanswered`); never a confident wrong value; every mutation toasts; `yarn lint` = `tsc -b --noEmit && oxlint`; coverage 90/85/90/90; yarn only.
- **Stage by path.** Go commits: `git add backend/...` (+ the two DTO files and docs when the task says so). Never `.claude/settings.json`; never the untracked `docs/superpowers/**` files unless a step names one. Trailer on every commit: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Dev stack: gateway `localhost:8080`, `yarn dev` in frontend-v2 on 3001; Root `admin` / `change-me-now`, login JSON field `identifier`; `docker compose up -d --build mesh-api mesh-worker gateway` rebuilds what this plan changes (check `docker compose ps` service names first; a failed registry token fetch can silently reuse a stale image — compare image timestamps).

## Rulings

1. **The index is one hash, `andrey:mesh:targets`, field `{kind}:{slug}` → job id, written in the same pipeline as the job hash.** Latest wins; no TTL (job hashes have none either). No backfill: the reconciler touches every unconverted target within a tick and the next `SaveJob` indexes it.
2. **`ListTargetJobs` returns every indexed job, sorted by kind then slug**, including succeeded ones — the gateway decides what the console needs; the RPC stays a plain read.
3. **`GET /api/jobs` drops succeeded jobs** and filters territories to the caller's visible set; models pass for everyone.
4. **The per-id SSE is scoped too:** a job whose territory the caller cannot see answers the existing `event: error` "job not found" frame, exactly as an unknown id does. Models pass. Root passes.
5. **The frontend maps** pending/running → `converting` (progress ×100, stage), failed → `failed` (error message in the inspector), otherwise the artifacts rule from Part 3. `lods`/`size` always come from the artifacts a row has — a failed re-conversion keeps showing what exists.
6. **Polling:** `jobsQuery` refetches every 5 s while any job is pending/running, never in a hidden tab, never otherwise. When a target leaves the live set, that row's artifacts query is invalidated so LODs and size catch up.
7. **A jobs failure is a screen failure** like any other query (`unanswered`), because a wrong "pending" is the confident wrong value the plan forbids.
8. **No Step 2.** No Redis Pub/Sub, no `WatchJobs`, no `/api/jobs/events`.

---

### Task 1: mesh-service — the target index and `ListTargetJobs`

**Files:**
- Modify: `backend/services/mesh-service/internal/storage/redis.go` (constant + key helper), `save_job.go`, `get_job.go` (extract `jobFromHash`)
- Create: `backend/services/mesh-service/internal/storage/list_target_jobs.go`, `backend/services/mesh-service/internal/storage/list_target_jobs_integration_test.go`
- Modify: `backend/services/mesh-service/internal/service/mesh.go` (Queue interface), regenerate `internal/service/mocks/queue_mock.go`
- Create: `backend/services/mesh-service/internal/service/list_target_jobs.go`, `list_target_jobs_test.go`
- Modify: `backend/proto/rosneft/mesh/v1/mesh.proto`; regenerate `backend/proto/gen/go/rosneft/mesh/v1/*`
- Modify: `backend/services/mesh-service/internal/transport/grpcapi/server.go` (Service interface); create `list_target_jobs.go`
- Modify: `backend/services/mesh-service/go.mod`/`go.sum` (testcontainers redis module)

**Interfaces:**
- Produces: Redis hash `andrey:mesh:targets`; `Queue.ListTargetJobs(ctx) ([]domain.Job, error)`; `Mesh.ListTargetJobs(ctx)`; RPC `MeshService.ListTargetJobs(ListTargetJobsRequest) returns (ListTargetJobsResponse{repeated Job jobs})`.

- [ ] **Step 1: The service method — failing test first**

`backend/services/mesh-service/internal/service/list_target_jobs_test.go`:

```go
package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service/mocks"
)

type ListTargetJobsSuite struct {
	suite.Suite
	queue *mocks.QueueMock
	svc   *service.Mesh
	ctx   context.Context
}

func TestListTargetJobsSuite(t *testing.T) { suite.Run(t, new(ListTargetJobsSuite)) }

func (s *ListTargetJobsSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.queue = mocks.NewQueueMock(mc)
	s.svc = service.New(service.Config{
		Queue:   s.queue,
		Catalog: mocks.NewCatalogMock(mc),
		Blobs:   mocks.NewBlobStoreMock(mc),
		IDGen:   func() string { return "fixed-id" },
	})
	s.ctx = s.T().Context()
}

func (s *ListTargetJobsSuite) TestReturnsWhatTheQueueIndexed() {
	jobs := []domain.Job{{ID: "j1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusRunning}}
	s.queue.ListTargetJobsMock.Expect(s.ctx).Return(jobs, nil)
	got, err := s.svc.ListTargetJobs(s.ctx)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, jobs)
}

func (s *ListTargetJobsSuite) TestPassesTheQueueErrorThrough() {
	boom := errors.New("redis down")
	s.queue.ListTargetJobsMock.Expect(s.ctx).Return(nil, boom)
	_, err := s.svc.ListTargetJobs(s.ctx)
	assert.ErrorIs(s.T(), err, boom)
}
```

Run: `cd backend/services/mesh-service && go test ./internal/service/ -run TestListTargetJobsSuite` — expected FAIL (no `ListTargetJobsMock`, no method).

- [ ] **Step 2: Queue interface, mock, service method**

In `internal/service/mesh.go`, add to `Queue` after `GetJob`:

```go
	// ListTargetJobs returns the latest job of every target that has one, in
	// kind-then-slug order. Every status is included; callers decide what a
	// succeeded job still means to them.
	ListTargetJobs(ctx context.Context) ([]domain.Job, error)
```

Regenerate the mocks: `cd backend/services/mesh-service && go generate ./internal/service/` (needs `minimock` on PATH; if absent: `go install github.com/gojuno/minimock/v3/cmd/minimock@v3.4.7` — match the version stamped in `mocks/queue_mock.go`'s header).

`internal/service/list_target_jobs.go`:

```go
package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// ListTargetJobs is the catalog-wide read behind the console's Content screen:
// one job per target, the latest, whatever its status.
func (m *Mesh) ListTargetJobs(ctx context.Context) ([]domain.Job, error) {
	return m.queue.ListTargetJobs(ctx)
}
```

Run the suite — expected PASS.

- [ ] **Step 3: Storage — the index write, the read, the shared parser**

`internal/storage/redis.go`: add beside `jobKeyPrefix`:

```go
	// targetsKey is one hash, field "{kind}:{slug}" → the latest job id for
	// that target. It is what lets the console ask "what is happening to X"
	// without holding a job id; the job hashes themselves stay keyed by id.
	targetsKey = "andrey:mesh:targets"
```

and below `jobKey`:

```go
func targetField(kind domain.Kind, slug string) string {
	return fmt.Sprintf("%s:%s", kind, slug)
}
```

(add the `domain` import). In `save_job.go`, replace the single `HSet` with one pipeline so a job never exists without its index entry:

```go
	_, err := r.client.TxPipelined(ctx, func(p redis.Pipeliner) error {
		p.HSet(ctx, jobKey(j.ID), fields)
		p.HSet(ctx, targetsKey, targetField(j.Kind, j.Slug), j.ID)
		return nil
	})
	if err != nil {
		return fmt.Errorf("storage.SaveJob: pipeline: %w", err)
	}
	return nil
```

(import `github.com/redis/go-redis/v9`). In `get_job.go`, move the hash→Job mapping into a helper so the list reuses it:

```go
// jobFromHash maps one HGETALL result to a Job. Unparseable numbers and
// timestamps read as zero values, as they always have.
func jobFromHash(res map[string]string) domain.Job {
	j := domain.Job{
		ID:           res["id"],
		Kind:         domain.ParseKind(res["kind"]),
		Slug:         res["slug"],
		Status:       domain.ParseJobStatus(res["status"]),
		ErrorMessage: res["error_message"],
		ArtifactHash: res["artifact_hash"],
		Stage:        res["stage"],
	}
	if p, err := strconv.ParseFloat(res["progress"], 32); err == nil {
		j.Progress = float32(p)
	}
	if t, err := time.Parse(time.RFC3339Nano, res["created_at"]); err == nil {
		j.CreatedAt = t
	}
	if t, err := time.Parse(time.RFC3339Nano, res["updated_at"]); err == nil {
		j.UpdatedAt = t
	}
	return j
}
```

and have `GetJob` `return jobFromHash(res), nil` after its not-found check.

`internal/storage/list_target_jobs.go`:

```go
package storage

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// ListTargetJobs reads the target index and the job hash behind each entry in
// one pipeline. An index entry whose job hash is gone (nothing deletes them
// today) is skipped rather than reported. The result is sorted by kind then
// slug: HVALS has no order and the console groups by kind.
func (r *Redis) ListTargetJobs(ctx context.Context) ([]domain.Job, error) {
	ids, err := r.client.HVals(ctx, targetsKey).Result()
	if err != nil {
		return nil, fmt.Errorf("storage.ListTargetJobs: hvals: %w", err)
	}
	cmds := make([]*redis.MapStringStringCmd, len(ids))
	if _, err := r.client.Pipelined(ctx, func(p redis.Pipeliner) error {
		for i, id := range ids {
			cmds[i] = p.HGetAll(ctx, jobKey(id))
		}
		return nil
	}); err != nil {
		return nil, fmt.Errorf("storage.ListTargetJobs: hgetall: %w", err)
	}
	out := make([]domain.Job, 0, len(ids))
	for _, c := range cmds {
		res, err := c.Result()
		if err != nil {
			return nil, fmt.Errorf("storage.ListTargetJobs: hgetall: %w", err)
		}
		if len(res) == 0 {
			continue
		}
		out = append(out, jobFromHash(res))
	}
	slices.SortFunc(out, func(a, b domain.Job) int {
		if a.Kind != b.Kind {
			return int(a.Kind) - int(b.Kind)
		}
		return strings.Compare(a.Slug, b.Slug)
	})
	return out, nil
}
```

(`domain.Kind` is an int enum with `KindTerritory` < `KindModel` — verify in `internal/domain/types.go`; if it is a string type, compare with `strings.Compare(a.Kind.String(), b.Kind.String())` instead.)

`go build ./...` and `go vet ./...` from the module — expected clean. `GOWORK=off go vet ./...` too.

- [ ] **Step 4: The first Redis integration test — failing first (it needs Docker)**

Add the dependency: `cd backend/services/mesh-service && go get github.com/testcontainers/testcontainers-go/modules/redis@v0.44.0 && GOWORK=off go mod tidy` (the other services pin `testcontainers-go v0.44.0`; keep versions aligned).

`internal/storage/list_target_jobs_integration_test.go`:

```go
//go:build integration

package storage_test

import (
	"context"
	"testing"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/storage"
)

// TargetIndexSuite runs against a real Redis: the pipeline that writes the job
// hash and its index entry together, and the pipelined read behind
// ListTargetJobs, are storage behaviour a mock cannot prove.
type TargetIndexSuite struct {
	suite.Suite
	ctr   *tcredis.RedisContainer
	store *storage.Redis
}

func TestTargetIndexSuite(t *testing.T) { suite.Run(t, new(TargetIndexSuite)) }

func (s *TargetIndexSuite) SetupSuite() {
	ctx := context.Background()
	// redis:8.10.1 — docker-compose.yml's pin.
	ctr, err := tcredis.Run(ctx, "redis:8.10.1")
	assert.NilError(s.T(), err)
	s.ctr = ctr
	uri, err := ctr.ConnectionString(ctx)
	assert.NilError(s.T(), err)
	opts, err := redis.ParseURL(uri)
	assert.NilError(s.T(), err)
	s.store, err = storage.New(ctx, redis.NewClient(opts))
	assert.NilError(s.T(), err)
}

func (s *TargetIndexSuite) TearDownSuite() {
	assert.NilError(s.T(), testcontainers.TerminateContainer(s.ctr))
}

func (s *TargetIndexSuite) TestLatestJobPerTargetInKindThenSlugOrder() {
	ctx := s.T().Context()
	save := func(j domain.Job) { assert.NilError(s.T(), s.store.SaveJob(ctx, j)) }
	save(domain.Job{ID: "m-old", Kind: domain.KindModel, Slug: "pump", Status: domain.JobStatusFailed})
	save(domain.Job{ID: "t-1", Kind: domain.KindTerritory, Slug: "yard", Status: domain.JobStatusRunning, Progress: 0.4, Stage: "parsing"})
	save(domain.Job{ID: "m-new", Kind: domain.KindModel, Slug: "pump", Status: domain.JobStatusPending})
	save(domain.Job{ID: "t-2", Kind: domain.KindTerritory, Slug: "block", Status: domain.JobStatusSucceeded})

	got, err := s.store.ListTargetJobs(ctx)
	assert.NilError(s.T(), err)

	ids := make([]string, len(got))
	for i, j := range got {
		ids[i] = j.ID
	}
	// Territories before models, slugs alphabetical, and pump's older job is gone.
	assert.DeepEqual(s.T(), ids, []string{"t-2", "t-1", "m-new"})
	assert.Equal(s.T(), got[1].Stage, "parsing")
	assert.Equal(s.T(), got[1].Progress, float32(0.4))

	// The superseded job is still readable by id: the index moved, the hash stayed.
	old, err := s.store.GetJob(ctx, "m-old")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), old.Status, domain.JobStatusFailed)
}
```

Run: `go test -tags=integration ./internal/storage/ -run TestTargetIndexSuite -v` — expected PASS (with Docker up). If Docker is unavailable, say so in the report and rely on `make check`; do not delete the test. Check `tcredis.RedisContainer` / `Run` signatures against the installed module (`go doc github.com/testcontainers/testcontainers-go/modules/redis`) and adjust names, not intent.

- [ ] **Step 5: The RPC**

In `backend/proto/rosneft/mesh/v1/mesh.proto`, add to `service MeshService`:

```proto
  // ListTargetJobs returns the latest job of every catalog target that has
  // one — the read behind the console's "what is converting" view. Every
  // status is included.
  rpc ListTargetJobs(ListTargetJobsRequest) returns (ListTargetJobsResponse);
```

and the messages at the end:

```proto
message ListTargetJobsRequest {}

message ListTargetJobsResponse {
  repeated Job jobs = 1;
}
```

Run `make -C backend proto-gen` (needs `buf`; `brew install bufbuild/buf/buf` if missing). Confirm `backend/proto/gen/go/rosneft/mesh/v1/mesh_grpc.pb.go` now has `ListTargetJobs`.

In `internal/transport/grpcapi/server.go` add to `Service`:

```go
	ListTargetJobs(ctx context.Context) ([]domain.Job, error)
```

`internal/transport/grpcapi/list_target_jobs.go`:

```go
package grpcapi

import (
	"context"

	meshv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/mesh/v1"
)

func (s *Server) ListTargetJobs(ctx context.Context, _ *meshv1.ListTargetJobsRequest) (*meshv1.ListTargetJobsResponse, error) {
	jobs, err := s.svc.ListTargetJobs(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*meshv1.Job, len(jobs))
	for i, j := range jobs {
		out[i] = jobToProto(j)
	}
	return &meshv1.ListTargetJobsResponse{Jobs: out}, nil
}
```

`go build ./...` from `backend/services/mesh-service` — expected clean (the compile-time check is `Server` still satisfying the generated interface).

- [ ] **Step 6: Gate and commit**

`make -C backend check` — expected green. Commit (hook runs the gate; no `--no-verify`):

```bash
git add backend/proto backend/services/mesh-service
git diff --cached --name-only
git commit -m "feat(mesh): index the latest job per target and list it over gRPC

SaveJob writes the job hash and one entry in andrey:mesh:targets
({kind}:{slug} → job id) in a single pipeline; ListTargetJobs reads the
index and every job behind it in one pipelined round trip, sorted by kind
then slug. It is the read the console needs to say what is converting
without a browser ever holding a job id. The first Redis-backed
integration test in this service covers the index (-tags=integration).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: gateway — `GET /api/jobs`, and the per-id stream scoped

**Files:**
- Modify: `backend/services/gateway-service/internal/clients/mesh/jobs.go`; `internal/service/gateway.go` (Mesh interface), regenerate `internal/service/mocks/mesh_mock.go`; `internal/service/jobs.go`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/server.go` (Service interface)
- Create: `backend/services/gateway-service/internal/transport/httpapi/list_jobs.go`, `list_jobs_test.go`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/watch_job_events.go`; create `watch_job_events_test.go`
- Modify: `backend/services/gateway-service/internal/bootstrap/transport.go`
- Modify: `backend/services/gateway-service/api/openapi.yaml`, `api/oapi-codegen.yaml` (comment), regenerate `internal/transport/httpapi/openapi_spec_gen.go` (+ `openapi_gen.go` if it changes)
- Regenerate: `frontend/src/shared/infrastructure/api/dto.ts`, `frontend-v2/src/shared/api/dto.ts`
- Modify: root `CLAUDE.md` ("Backend gateway endpoints used by the frontend"), `backend/services/gateway-service/README.md` route table if it has one

**Interfaces:**
- Consumes: Task 1's RPC.
- Produces: `Mesh.ListTargetJobs(ctx)` on the client; `Gateway.ListTargetJobs(ctx) ([]domain.Job, error)`; `GET /api/jobs` → `200 Job[]` (`Cache-Control: no-store`); pure `visibleJob(j domain.Job, visible map[string]bool, allAccess bool) bool`; `WatchJobEvents` answers "job not found" for a territory the caller cannot see.

- [ ] **Step 1: Client and service**

`internal/clients/mesh/jobs.go`, append:

```go
// ListTargetJobs fetches the latest job per catalog target.
func (c *Client) ListTargetJobs(ctx context.Context) ([]domain.Job, error) {
	resp, err := c.cc.ListTargetJobs(ctx, &meshv1.ListTargetJobsRequest{})
	if err != nil {
		return nil, fmt.Errorf("mesh.ListTargetJobs: %w", grpcerr.MapStatus(err, nil))
	}
	out := make([]domain.Job, len(resp.GetJobs()))
	for i, j := range resp.GetJobs() {
		out[i] = jobFromProto(j)
	}
	return out, nil
}
```

`internal/service/gateway.go`, `Mesh` interface: add `ListTargetJobs(ctx context.Context) ([]domain.Job, error)`. Regenerate: `cd backend/services/gateway-service && go generate ./internal/service/`.

`internal/service/jobs.go`, append:

```go
// ListTargetJobs is the raw read; the handler applies the tenant filter,
// because visibility is a property of the caller, not of the job.
func (g *Gateway) ListTargetJobs(ctx context.Context) ([]domain.Job, error) {
	return g.mesh.ListTargetJobs(ctx)
}
```

`internal/transport/httpapi/server.go`, `Service`: add `ListTargetJobs(ctx context.Context) ([]domain.Job, error)` beside `GetJob`.

`go build ./...` — expected clean.

- [ ] **Step 2: The visibility rule and the list handler — tests first**

`internal/transport/httpapi/list_jobs_test.go` (in-package, like `territory_gate_test.go`; reuse its `gateServiceStub` idea — a stub embedding `Service` that implements only what the handler calls):

```go
package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

type ListJobsSuite struct{ suite.Suite }

func TestListJobsSuite(t *testing.T) { suite.Run(t, new(ListJobsSuite)) }

var (
	runningYard   = domain.Job{ID: "j1", Kind: domain.KindTerritory, Slug: "yard", Status: domain.JobStatusRunning}
	failedBlock   = domain.Job{ID: "j2", Kind: domain.KindTerritory, Slug: "block", Status: domain.JobStatusFailed}
	doneBlock     = domain.Job{ID: "j3", Kind: domain.KindTerritory, Slug: "done", Status: domain.JobStatusSucceeded}
	pendingPump   = domain.Job{ID: "j4", Kind: domain.KindModel, Slug: "pump", Status: domain.JobStatusPending}
	allTargetJobs = []domain.Job{runningYard, failedBlock, doneBlock, pendingPump}
)

// The rule, on its own: succeeded never, models always, territories only when visible.
func (s *ListJobsSuite) TestVisibleJob() {
	visible := map[string]bool{"yard": true}
	assert.Assert(s.T(), visibleJob(runningYard, visible, false))
	assert.Assert(s.T(), !visibleJob(failedBlock, visible, false))
	assert.Assert(s.T(), visibleJob(failedBlock, visible, true), "Root sees every territory")
	assert.Assert(s.T(), visibleJob(pendingPump, map[string]bool{}, false), "models are shared")
	assert.Assert(s.T(), !visibleJob(doneBlock, visible, true), "succeeded is never listed")
}

// jobsServiceStub answers the two reads the handler makes and panics on
// anything else, so a handler that starts touching more is caught here.
type jobsServiceStub struct {
	Service
	territories []domain.Territory
	listErr     error
}

func (j jobsServiceStub) ListTargetJobs(context.Context) ([]domain.Job, error) {
	return allTargetJobs, j.listErr
}

func (j jobsServiceStub) ListTerritories(_ context.Context, scopeAdminID string) ([]domain.Territory, error) {
	if scopeAdminID != "admin-1" {
		return nil, nil
	}
	return j.territories, nil
}

func (s *ListJobsSuite) get(stub Service, ctx context.Context) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	r.With(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	}).Get("/api/jobs", New(stub).ListJobs)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/jobs", nil))
	return rec
}

func ids(s *ListJobsSuite, rec *httptest.ResponseRecorder) []string {
	var body []Job
	assert.NilError(s.T(), json.Unmarshal(rec.Body.Bytes(), &body))
	out := make([]string, len(body))
	for i, j := range body {
		out[i] = j.Id
	}
	return out
}

func (s *ListJobsSuite) TestRootSeesEveryLiveJob() {
	rec := s.get(jobsServiceStub{}, authhttp.NewTestContext(context.Background(), true, ""))
	assert.Equal(s.T(), rec.Code, http.StatusOK)
	assert.Equal(s.T(), rec.Header().Get("Cache-Control"), "no-store")
	assert.DeepEqual(s.T(), ids(s, rec), []string{"j1", "j2", "j4"})
}

func (s *ListJobsSuite) TestScopedCallerSeesOwnTerritoriesAndEveryModel() {
	stub := jobsServiceStub{territories: []domain.Territory{{Slug: "yard"}}}
	rec := s.get(stub, authhttp.NewTestContext(context.Background(), false, "admin-1"))
	assert.Equal(s.T(), rec.Code, http.StatusOK)
	assert.DeepEqual(s.T(), ids(s, rec), []string{"j1", "j4"})
}

func (s *ListJobsSuite) TestScopedCallerWithNoAdminSeesNothing() {
	rec := s.get(jobsServiceStub{}, authhttp.NewTestContext(context.Background(), false, ""))
	assert.Equal(s.T(), rec.Code, http.StatusOK)
	assert.Equal(s.T(), rec.Body.String(), "[]\n")
}

func (s *ListJobsSuite) TestMeshOutageIsA500NotAnEmptyList() {
	rec := s.get(jobsServiceStub{listErr: context.DeadlineExceeded}, authhttp.NewTestContext(context.Background(), true, ""))
	assert.Equal(s.T(), rec.Code, http.StatusInternalServerError)
}
```

(`domain.KindTerritory`/`domain.KindModel` — confirm the gateway's `domain.Kind` constant names in `internal/domain/types.go`; `jobToAPI` already does `JobKind(j.Kind)`, so `Kind` is a string type.) Run: `go test ./internal/transport/httpapi/ -run TestListJobsSuite` — expected FAIL to compile.

- [ ] **Step 3: The handler**

`internal/transport/httpapi/list_jobs.go`:

```go
package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// ListJobs answers GET /api/jobs: the latest job per catalog target that is
// still worth showing, filtered to what the caller may see. It is the poll
// behind the console's Content screen, so it declines caching outright.
//
// Registered on the root router like WatchJobEvents — the `jobs` tag is
// excluded from the generated stubs.
func (s *Server) ListJobs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	scopeAdminID, allAccess := authhttp.Scope(ctx)
	if !allAccess && scopeAdminID == "" {
		writeJobs(w, nil) // fail-closed, as ListTerritories does
		return
	}
	jobs, err := s.svc.ListTargetJobs(ctx)
	if err != nil {
		apperr.Write(w, http.StatusInternalServerError, apperr.SlugInternal, errMsg(err))
		return
	}
	visible := map[string]bool{}
	if !allAccess {
		territories, err := s.svc.ListTerritories(ctx, scopeAdminID)
		if err != nil {
			apperr.Write(w, http.StatusInternalServerError, apperr.SlugInternal, errMsg(err))
			return
		}
		for _, t := range territories {
			visible[t.Slug] = true
		}
	}
	out := make([]domain.Job, 0, len(jobs))
	for _, j := range jobs {
		if visibleJob(j, visible, allAccess) {
			out = append(out, j)
		}
	}
	writeJobs(w, out)
}

// visibleJob is the one rule both /api/jobs and the per-id stream apply.
// Succeeded is never shown: the artifacts already say "ready", and a stale
// "succeeded" would outlive a replaced source. Models are shared by decision;
// a territory needs to be in the caller's visible set unless they are Root.
func visibleJob(j domain.Job, visible map[string]bool, allAccess bool) bool {
	if j.Status == domain.JobStatusSucceeded {
		return false
	}
	return j.Kind != domain.KindTerritory || allAccess || visible[j.Slug]
}

func writeJobs(w http.ResponseWriter, jobs []domain.Job) {
	resp := make([]Job, len(jobs))
	for i, j := range jobs {
		resp[i] = jobToAPI(j)
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(resp)
}
```

Run the suite — expected PASS.

- [ ] **Step 4: Scope the per-id stream — test first**

`internal/transport/httpapi/watch_job_events_test.go`:

```go
package httpapi

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

type WatchJobEventsSuite struct{ suite.Suite }

func TestWatchJobEventsSuite(t *testing.T) { suite.Run(t, new(WatchJobEventsSuite)) }

// streamJob had no test before this. A terminal job is the shape that ends
// the loop on its own, so it is the one a unit test can drive to completion.
func (s *WatchJobEventsSuite) TestStreamEmitsATerminalJobOnceAndReturns() {
	rec := httptest.NewRecorder()
	done := domain.Job{ID: "j1", Kind: domain.KindModel, Slug: "pump", Status: domain.JobStatusSucceeded}
	fetch := func(context.Context, string) (domain.Job, error) { return done, nil }
	streamJob(context.Background(), rec, rec, "j1", fetch)
	body := rec.Body.String()
	assert.Assert(s.T(), strings.HasPrefix(body, "event: job\n"), body)
	assert.Assert(s.T(), strings.Contains(body, `"status":"succeeded"`), body)
	assert.Equal(s.T(), strings.Count(body, "event: job"), 1)
}

func (s *WatchJobEventsSuite) TestStreamReportsAnUnknownJobAsAnErrorFrame() {
	rec := httptest.NewRecorder()
	fetch := func(context.Context, string) (domain.Job, error) { return domain.Job{}, domain.ErrJobNotFound }
	streamJob(context.Background(), rec, rec, "nope", fetch)
	assert.Assert(s.T(), strings.HasPrefix(rec.Body.String(), "event: error\n"), rec.Body.String())
}

type watchServiceStub struct {
	Service
	job      domain.Job
	visible  map[string]bool
	lookedUp []string
}

func (w *watchServiceStub) GetJob(context.Context, string) (domain.Job, error) { return w.job, nil }

func (w *watchServiceStub) GetTerritory(_ context.Context, slug, _ string) (domain.Territory, error) {
	w.lookedUp = append(w.lookedUp, slug)
	if w.visible[slug] {
		return domain.Territory{Slug: slug}, nil
	}
	return domain.Territory{}, domain.ErrTerritoryNotFound
}

// The same 404-shaped refusal the territory routes give: a scoped caller who
// cannot see the territory gets "job not found", never a 403 that confirms it.
func (s *WatchJobEventsSuite) TestScopedFetchHidesAnotherTenantsTerritoryJob() {
	stub := &watchServiceStub{job: domain.Job{ID: "j1", Kind: domain.KindTerritory, Slug: "theirs", Status: domain.JobStatusRunning}}
	srv := New(stub)
	ctx := authhttp.NewTestContext(context.Background(), false, "admin-1")
	_, err := srv.scopedJob(ctx, "j1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrJobNotFound))
	assert.DeepEqual(s.T(), stub.lookedUp, []string{"theirs"})
}

func (s *WatchJobEventsSuite) TestScopedFetchPassesOwnTerritoryModelsAndRoot() {
	own := &watchServiceStub{job: domain.Job{ID: "j1", Kind: domain.KindTerritory, Slug: "mine", Status: domain.JobStatusRunning}, visible: map[string]bool{"mine": true}}
	_, err := New(own).scopedJob(authhttp.NewTestContext(context.Background(), false, "admin-1"), "j1")
	assert.NilError(s.T(), err)

	model := &watchServiceStub{job: domain.Job{ID: "j2", Kind: domain.KindModel, Slug: "pump", Status: domain.JobStatusRunning}}
	_, err = New(model).scopedJob(authhttp.NewTestContext(context.Background(), false, "admin-1"), "j2")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(model.lookedUp), 0, "a model never asks the catalog")

	root := &watchServiceStub{job: domain.Job{ID: "j3", Kind: domain.KindTerritory, Slug: "theirs", Status: domain.JobStatusRunning}}
	_, err = New(root).scopedJob(authhttp.NewTestContext(context.Background(), true, ""), "j3")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(root.lookedUp), 0, "Root skips the lookup")
}
```

(`domain.ErrTerritoryNotFound` — use whatever sentinel `GetTerritory` returns for not-found in the gateway domain; grep `ErrTerritoryNotFound` / `ErrNotFound` in `internal/domain`.) Run — expected FAIL (`scopedJob` undefined).

- [ ] **Step 5: `scopedJob`**

In `watch_job_events.go`, replace `streamJob(r.Context(), w, flusher, id, s.svc.GetJob)` with `streamJob(r.Context(), w, flusher, id, s.scopedJob)` and add:

```go
// scopedJob is GetJob behind the tenant rule: a territory job the caller
// cannot see reads as not found, which streamJob already turns into the
// `error` frame an unknown id gets. Models and Root skip the catalog lookup.
// Succeeded jobs still stream — the per-id route is how an upload that just
// finished learns so, and it closes on its own.
func (s *Server) scopedJob(ctx context.Context, id string) (domain.Job, error) {
	job, err := s.svc.GetJob(ctx, id)
	if err != nil {
		return domain.Job{}, err
	}
	scopeAdminID, allAccess := authhttp.Scope(ctx)
	if allAccess || job.Kind != domain.KindTerritory {
		return job, nil
	}
	// Fail closed: an empty scope DISABLES the catalog's tenant filter, so
	// asking with "" would answer yes for any territory.
	if scopeAdminID == "" {
		return domain.Job{}, domain.ErrJobNotFound
	}
	if _, err := s.svc.GetTerritory(ctx, job.Slug, scopeAdminID); err != nil {
		return domain.Job{}, domain.ErrJobNotFound
	}
	return job, nil
}
```

Note `visibleJob` drops succeeded jobs for the list, and `scopedJob` deliberately does not — the comment says why; do not "unify" them. Run the suite — expected PASS.

- [ ] **Step 6: Mount, contract, docs**

`internal/bootstrap/transport.go`: replace the SSE comment + line with:

```go
	// SSE and the jobs list — outside the JSON middleware chain (the stream
	// cannot be buffered, the list must not be cached), but inside the tenant:
	// both apply the territory rule through Server.scopedJob / visibleJob, and
	// a territory the caller cannot see reads as "job not found".
	r.With(authH.Authenticate).Get("/api/jobs/{id}/events", apiServer.WatchJobEvents)
	r.With(authH.Authenticate).Get("/api/jobs", apiServer.ListJobs)
```

`api/openapi.yaml`: above `/api/jobs/{id}/events` add:

```yaml
  /api/jobs:
    get:
      tags: [jobs]
      summary: The latest conversion job per catalog target, tenant-filtered
      description: >
        One entry per territory or model that has a job on record, excluding
        succeeded ones (the artifacts already say "ready"). Territories are
        filtered to the caller's visible set — the same rule as `GET
        /api/territories`; models are listed for everyone. Answers
        `Cache-Control: no-store`: the console polls it while a conversion runs.
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Job' }
        '500': { $ref: '#/components/responses/Internal' }
```

and update the `/api/jobs/{id}/events` description's last sentence to say the stream is tenant-scoped: "A territory job the caller cannot see is reported as not found." In `api/oapi-codegen.yaml`'s comment, change `jobs → SSE stream handler (WatchJobEvents)` to `jobs → SSE stream + jobs list (WatchJobEvents, ListJobs)`. Run `make -C backend openapi-gen`.

Regenerate both DTOs: `cd frontend && yarn openapi:generate && yarn lint`; `cd frontend-v2 && yarn openapi:generate && yarn lint`. (Type-only change; both lints must stay green.)

Root `CLAUDE.md`, section "Backend gateway endpoints used by the frontend": add after the `/api/jobs/{id}/events` bullets:

```
- `GET /api/jobs` — the latest conversion job per territory/model, succeeded ones excluded, territories filtered to the caller's visible set. `Cache-Control: no-store`; the v2 console polls it every 5 s while anything is running. The per-id SSE applies the same rule: a territory job the caller cannot see is "job not found".
```

and amend the existing `GET /api/jobs/{id}/events` bullet's "deliberately not tenant-scoped" sentence to say it now is. If `backend/services/gateway-service/README.md` has a route/permission table, add `GET /api/jobs` (session only).

- [ ] **Step 7: Gate, live, commit**

`make -C backend check` — green. Live: `docker compose up -d --build mesh-api mesh-worker gateway` (confirm the service names with `docker compose ps`; verify the images were rebuilt), then as `admin`: `GET http://localhost:8080/api/jobs` → `200` JSON array (possibly empty until a job runs; the reconciler indexes within 5 minutes, or trigger one: `POST /api/territories/desktop-proxy-sse-check-3/source` with that territory's own `sourceBlobHash` from `GET /api/territories`, which re-queues a conversion — then the list shows it pending/running, and the row disappears once succeeded). As `cotest`: the list excludes territories `cotest` cannot see (compare with `cotest`'s `GET /api/territories`). Record what you saw.

Commit (hook runs the gate):

```bash
git add backend/services/gateway-service frontend/src/shared/infrastructure/api/dto.ts frontend-v2/src/shared/api/dto.ts CLAUDE.md
git diff --cached --name-only
git commit -m "feat(gateway): GET /api/jobs, tenant-filtered, and a scoped per-id stream

The latest job per catalog target, succeeded ones dropped, territories
filtered to the caller's visible set and models shared — one call the
console polls while something converts. The per-id SSE applies the same
rule and gains its first test. The jobs tag stays outside the generated
stubs: both handlers live on the root router, past the ETag chain.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: frontend-v2 — converting and failed rows, polling, docs, live

**Files:**
- Create: `frontend-v2/src/entities/conversion/model/target-job.ts`, `target-job.spec.ts`, `frontend-v2/src/entities/conversion/api/to-target-job.ts`, `to-target-job.spec.ts`, `jobs-gateway.ts`, `jobs-gateway.spec.ts`, `jobs-query.ts`, `jobs-query.spec.ts`; modify `frontend-v2/src/entities/conversion/index.ts`
- Modify: `frontend-v2/src/pages/content/model/catalog.ts` (+ spec), `use-content.ts` (+ spec), `frontend-v2/src/pages/content/ui/content-screen.tsx` (+ spec)
- Modify: `frontend-v2/CLAUDE.md`, `frontend-v2/README.md`, `docs/superpowers/specs/2026-09-03-conversion-visibility-design.md` (status line)

**Interfaces:**
- Consumes: `GET /api/jobs` (`components["schemas"]["Job"]`), Task 2's contract.
- Produces: `TargetJob = { kind: ContentKind; slug: string; status: "pending" | "running" | "succeeded" | "failed"; progress: number | null; stage: string | null; errorMessage: string | null }`; `isLive(job)`; `pollInterval(jobs): number | false`; `finishedSince(prev, next): { kind; slug }[]`; `toTargetJob(dto)`; `listJobs()`; `jobsQuery` (key `["jobs"]`); `toContentItem(kind, entity, artifacts, job?)`; `inspectorDetails(item, artifacts, updatedAt, job?)`; `conversionNoteOf(job)`; `ContentState.jobOf(kind, slug)`.

- [ ] **Step 1: The job model and its decisions — spec first**

`src/entities/conversion/model/target-job.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { finishedSince, isLive, pollInterval, type TargetJob } from "./target-job";

const job = (over: Partial<TargetJob> = {}): TargetJob => ({
  kind: "territory", slug: "t", status: "running", progress: 0.4, stage: "parsing", errorMessage: null, ...over,
});

describe("target jobs", () => {
  it("is live while pending or running, and nothing else", () => {
    expect(isLive(job({ status: "pending" }))).toBe(true);
    expect(isLive(job({ status: "running" }))).toBe(true);
    expect(isLive(job({ status: "failed" }))).toBe(false);
    expect(isLive(job({ status: "succeeded" }))).toBe(false);
  });

  it("polls every five seconds only while something is live", () => {
    expect(pollInterval([job(), job({ slug: "u", status: "failed" })])).toBe(5000);
    expect(pollInterval([job({ status: "failed" })])).toBe(false);
    expect(pollInterval([])).toBe(false);
    expect(pollInterval(undefined)).toBe(false);
  });

  it("names the targets that stopped being live between two answers", () => {
    const prev = [job({ slug: "a" }), job({ slug: "b" }), job({ kind: "model", slug: "m" })];
    const next = [job({ slug: "a", status: "failed" }), job({ kind: "model", slug: "m" })];
    expect(finishedSince(prev, next)).toEqual([{ kind: "territory", slug: "a" }, { kind: "territory", slug: "b" }]);
    expect(finishedSince(undefined, next)).toEqual([]);
  });
});
```

Run: `yarn vitest run src/entities/conversion/model/target-job.spec.ts` — expected FAIL, module not found.

- [ ] **Step 2: The model**

`src/entities/conversion/model/target-job.ts`:

```ts
export type TargetJobStatus = "pending" | "running" | "succeeded" | "failed";

// Not imported from @/entities/content: that slice already imports
// ConversionStatus from here, and a cycle between two entities is the kind
// of thing architecture.spec.ts cannot see but Vite's module graph can.
export type TargetKind = "territory" | "model";

/** The latest conversion job of one territory or model, as /api/jobs lists them. */
export type TargetJob = {
  kind: TargetKind;
  slug: string;
  status: TargetJobStatus;
  /** 0–1, or null before the worker has reported anything. */
  progress: number | null;
  stage: string | null;
  errorMessage: string | null;
};

export const isLive = (job: TargetJob): boolean => job.status === "pending" || job.status === "running";

// Long enough not to hammer the gateway, short enough that a stage change
// (they come at coarse boundaries, seconds apart) reads as live.
const POLL_MS = 5000;

/** What jobsQuery hands refetchInterval: poll only while a conversion runs. */
export const pollInterval = (jobs: TargetJob[] | undefined): number | false =>
  jobs?.some(isLive) ? POLL_MS : false;

const key = (j: { kind: TargetKind; slug: string }) => `${j.kind}/${j.slug}`;

/** Targets that were live in `prev` and are not live in `next` — their artifacts may have changed. */
export function finishedSince(
  prev: TargetJob[] | undefined,
  next: TargetJob[],
): { kind: TargetKind; slug: string }[] {
  const stillLive = new Set(next.filter(isLive).map(key));
  return (prev ?? []).filter((j) => isLive(j) && !stillLive.has(key(j))).map(({ kind, slug }) => ({ kind, slug }));
}
```

Run the spec — expected PASS.

- [ ] **Step 3: Mapper, gateway, query — specs first**

`src/entities/conversion/api/to-target-job.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toTargetJob } from "./to-target-job";

describe("toTargetJob", () => {
  it("maps the whole shape and reads absent fields as null", () => {
    expect(toTargetJob({ id: "j1", kind: "territory", slug: "yard", status: "running", progress: 0.4, stage: "parsing" })).toEqual({
      kind: "territory", slug: "yard", status: "running", progress: 0.4, stage: "parsing", errorMessage: null,
    });
    expect(toTargetJob({ id: "j2", kind: "model", slug: "pump", status: "failed", errorMessage: "OBJ parse error at line 84120" })).toEqual({
      kind: "model", slug: "pump", status: "failed", progress: null, stage: null, errorMessage: "OBJ parse error at line 84120",
    });
  });
});
```

`src/entities/conversion/api/jobs-gateway.spec.ts` — mirror `src/entities/territory/api/territories-gateway.spec.ts` (fetch factory stub, `request()` helper): `listJobs()` requests `GET /api/jobs` and maps each entry with `toTargetJob`; a `null` body (defensive — the gateway always sends `[]`, but the Part 2 rule stands) maps to `[]`.

`src/entities/conversion/api/jobs-query.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("./jobs-gateway", () => ({ listJobs: vi.fn(async () => []) }));
const { jobsQuery } = await import("./jobs-query");

describe("jobsQuery", () => {
  it("keys the list, delegates, never polls in the background", async () => {
    expect(jobsQuery.queryKey).toEqual(["jobs"]);
    const run = jobsQuery.queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual([]);
    expect(jobsQuery.refetchIntervalInBackground).toBe(false);
    expect(typeof jobsQuery.refetchInterval).toBe("function");
  });
});
```

Run — expected FAIL.

- [ ] **Step 4: Mapper, gateway, query**

`src/entities/conversion/api/to-target-job.ts`:

```ts
import type { components } from "@/shared/api/dto";
import type { TargetJob } from "../model/target-job";

type JobDto = components["schemas"]["Job"];

export const toTargetJob = (d: JobDto): TargetJob => ({
  kind: d.kind,
  slug: d.slug,
  status: d.status,
  progress: d.progress ?? null,
  stage: d.stage ?? null,
  errorMessage: d.errorMessage ?? null,
});
```

`src/entities/conversion/api/jobs-gateway.ts`:

```ts
import { httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { TargetJob } from "../model/target-job";
import { toTargetJob } from "./to-target-job";

type JobDto = components["schemas"]["Job"];

/** The latest job per target the caller may see; the gateway already dropped succeeded ones. */
export const listJobs = async (): Promise<TargetJob[]> =>
  ((await httpGet<JobDto[] | null>("/api/jobs")) ?? []).map(toTargetJob);
```

`src/entities/conversion/api/jobs-query.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { pollInterval } from "../model/target-job";
import { listJobs } from "./jobs-gateway";

/** Polls only while a conversion is live, and never in a hidden tab. */
export const jobsQuery = queryOptions({
  queryKey: ["jobs"],
  queryFn: listJobs,
  refetchInterval: (query) => pollInterval(query.state.data),
  refetchIntervalInBackground: false,
});
```

Add to `src/entities/conversion/index.ts`:

```ts
export { finishedSince, isLive, pollInterval, type TargetJob, type TargetJobStatus, type TargetKind } from "./model/target-job";
export { listJobs } from "./api/jobs-gateway";
export { jobsQuery } from "./api/jobs-query";
```

Run: `yarn vitest run src/entities/conversion` — expected PASS.

- [ ] **Step 5: The catalog learns about jobs — spec first**

Add to `src/pages/content/model/catalog.spec.ts`:

```ts
describe("toContentItem with a job", () => {
  const running = { kind: "territory" as const, slug: "north-ridge-pad", status: "running" as const, progress: 0.62, stage: "textures", errorMessage: null };
  const failed = { ...running, status: "failed" as const, progress: null, stage: null, errorMessage: "OBJ parse error at line 84120" };

  it("is converting with a percentage and a stage while the job runs, keeping what is already converted", () => {
    expect(toContentItem("territory", territory, ARTIFACTS, running)).toMatchObject({
      status: "converting", progress: 62, stage: "textures", lods: "LOD 0-2", size: "412 MB",
    });
    expect(toContentItem("territory", territory, [], { ...running, status: "pending", progress: null, stage: null })).toMatchObject({
      status: "converting", progress: undefined, stage: undefined, lods: "—", size: "—",
    });
  });

  it("is failed when the job failed, whatever the artifacts say", () => {
    expect(toContentItem("territory", territory, ARTIFACTS, failed).status).toBe("failed");
    expect(toContentItem("territory", territory, [], failed).status).toBe("failed");
  });

  it("ignores a succeeded job — the artifacts decide", () => {
    expect(toContentItem("territory", territory, [], { ...running, status: "succeeded" }).status).toBe("pending");
  });

  it("puts the worker's message in the inspector and a note above the bar", () => {
    expect(inspectorDetails(item({ status: "failed" }), ARTIFACTS, territory.updatedAt, failed)[0]).toEqual({
      label: "Error", value: "OBJ parse error at line 84120", tone: "bad",
    });
    expect(inspectorDetails(item(), ARTIFACTS, territory.updatedAt, undefined)[0].label).toBe("Artifacts");
    expect(conversionNoteOf(running)).toBe("62% · textures");
    expect(conversionNoteOf({ ...running, progress: null, stage: null })).toBe("queued");
    expect(conversionNoteOf(failed)).toBeUndefined();
  });
});
```

Run — expected FAIL.

- [ ] **Step 6: Implement in `catalog.ts`**

Change `toContentItem` to:

```ts
import { isLive, type TargetJob } from "@/entities/conversion";

/**
 * A catalog row. A live job says "converting" whatever the artifacts hold —
 * a replaced source keeps its old LODs on screen until the new ones land;
 * a failed job says so; otherwise the artifacts decide between ready and
 * pending. A succeeded job adds nothing the artifacts do not already say.
 */
export function toContentItem(kind: ContentKind, entity: Entity, artifacts: Artifact[], job?: TargetJob): ContentItem {
  const date = shortDate(entity.updatedAt);
  const converted = artifacts.length > 0;
  const base: ContentItem = {
    kind,
    slug: entity.slug,
    title: entity.title,
    status: converted ? "ready" : "pending",
    meta: date ? `${entity.slug} · upd. ${date}` : entity.slug,
    lods: lodLabel(artifacts),
    size: converted ? formatBytes(totalSize(artifacts)) : "—",
  };
  if (!job) return base;
  if (job.status === "failed") return { ...base, status: "failed" };
  if (!isLive(job)) return base;
  return {
    ...base,
    status: "converting",
    ...(job.progress === null ? {} : { progress: Math.round(job.progress * 100) }),
    ...(job.stage === null ? {} : { stage: job.stage }),
  };
}

/** Right of the "Conversion" overline: "62% · textures", or "queued" before the worker reports. */
export function conversionNoteOf(job: TargetJob): string | undefined {
  if (!isLive(job)) return undefined;
  if (job.progress === null && job.stage === null) return "queued";
  const parts = [job.progress === null ? null : `${Math.round(job.progress * 100)}%`, job.stage];
  return parts.filter((p) => p !== null).join(" · ");
}
```

and `inspectorDetails` gains a fourth parameter `job?: TargetJob` and prepends `{ label: "Error", value: job.errorMessage, tone: "bad" }` when `job?.status === "failed" && job.errorMessage`. Update the existing `inspectorDetails` calls in the spec to pass `undefined`. Run the spec — expected PASS.

- [ ] **Step 7: The container — spec first**

Add to `src/pages/content/model/use-content.spec.tsx`: in the `fetchMock` add `if (url === "/api/jobs" && method === "GET") return json(JOBS);` with a mutable `let JOBS: unknown[] = [];` reset in `beforeEach`, and the cases:

```tsx
  it("folds the live job into the row and exposes it for the inspector", async () => {
    JOBS = [{ id: "j1", kind: "territory", slug: "t-1", status: "running", progress: 0.4, stage: "parsing" }];
    const { result } = renderHook(() => useContent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items?.[0]).toMatchObject({ slug: "t-1", status: "converting", progress: 40, stage: "parsing" });
    expect(result.current.jobOf("territory", "t-1")?.stage).toBe("parsing");
  });

  it("is unavailable when the jobs list is refused", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/jobs" ? json({ code: "internal", message: "mesh is down" }, 500) : json([]),
    );
    const { result } = renderHook(() => useContent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("mesh is down");
  });

  it("re-reads a row's artifacts once its job stops being live", async () => {
    JOBS = [{ id: "j1", kind: "territory", slug: "t-1", status: "running" }];
    const { result } = renderHook(() => useContent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const before = fetchMock.mock.calls.filter(([u]) => u === "/api/territories/t-1/artifacts").length;
    JOBS = [];
    await act(async () => {
      await client.refetchQueries({ queryKey: ["jobs"] });
    });
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([u]) => u === "/api/territories/t-1/artifacts").length).toBe(before + 1),
    );
  });
```

Run — expected FAIL.

- [ ] **Step 8: The container**

In `use-content.ts`: import `finishedSince, jobsQuery, type TargetJob` from `@/entities/conversion` and `useEffect, useRef` from react. Add `const jobs = useQuery(jobsQuery);` beside the lists; a lookup

```ts
  const jobOf = (kind: ContentKind, slug: string) =>
    jobs.data?.find((j) => j.kind === kind && j.slug === slug);
```

pass `jobOf(kind, slug)` as the fourth argument of both `toContentItem` calls; fold `jobs` into `loading` (`|| jobs.isPending`) and `failed` (`?? unanswered(jobs)`); expose `jobOf` on `ContentState` (type: `(kind: ContentKind, slug: string) => TargetJob | undefined`); and the catch-up effect:

```ts
  // A row whose job just finished has new artifacts (or, after a failure, the
  // same old ones): re-read that row's artifacts so LODs and size catch up.
  const previousJobs = useRef<TargetJob[] | undefined>(undefined);
  useEffect(() => {
    if (!jobs.data) return;
    for (const { kind, slug } of finishedSince(previousJobs.current, jobs.data)) {
      void client.invalidateQueries({ queryKey: ["artifacts", kind, slug] });
    }
    previousJobs.current = jobs.data;
  }, [jobs.data, client]);
```

Run: `yarn vitest run src/pages/content/model` — expected PASS.

- [ ] **Step 9: The screen — spec, then wiring**

Add to `src/pages/content/ui/content-screen.spec.tsx`: the `state()` helper gains `jobOf: () => undefined`; a case where `selected` is a converting item and `jobOf` returns a running job asserts the inspector shows the progress bar's accessible name (`"T 1 conversion"`, check `ContentInspector`'s `ariaLabel`) and the note text `"62% · textures"`; a case with a failed job asserts the "Error" detail row text is visible.

In `content-screen.tsx`: `const job = selected ? s.jobOf(selected.kind, selected.slug) : undefined;` and in `inspected`: `details: inspectorDetails(selected, artifacts, updatedAt, job)`, `conversionNote: job ? conversionNoteOf(job) : undefined`. Run: `yarn vitest run src/pages/content` — expected PASS.

- [ ] **Step 10: Docs**

- `frontend-v2/CLAUDE.md`: replace the trap line "`ConversionStatus` `pending` means no artifacts — v2 starts no jobs…" with: "`ConversionStatus`: a live job from `GET /api/jobs` says `converting`, a failed one `failed`; otherwise artifacts decide `ready`/`pending`. `jobsQuery` polls every 5 s only while a job is live (`pollInterval`), never in a hidden tab." Mention in "What is wired" that Content shows conversions.
- `frontend-v2/README.md`: one sentence in the Content description.
- `docs/superpowers/specs/2026-09-03-conversion-visibility-design.md`: change the Status line to "Step 1 implemented 2026-09-04 (plan `docs/superpowers/plans/2026-09-04-conversion-visibility.md`); Step 2 not built." — this file is untracked; edit it but stage it only if the user has asked for the docs to be committed.

- [ ] **Step 11: Lint, suite, coverage, live**

`yarn lint && yarn test && yarn test:coverage`. Live on http://localhost:3001 as `admin` with the rebuilt stack from Task 2: open `/console/content`; trigger a reconversion of `desktop-proxy-sse-check-3` (`POST /api/territories/desktop-proxy-sse-check-3/source` with its own `sourceBlobHash`, CSRF token from `/api/auth/me`); within 5 s the row turns "converting" with a percentage and stage, the inspector shows the note above the bar; when the worker finishes the row returns to "ready" and the polling stops (Network tab: no more `/api/jobs` requests). If the worker fails it, the row reads "failed" and the inspector's first row is the error. Record what you saw and the stack's final state.

- [ ] **Step 12: Commit**

```bash
git add frontend-v2
git diff --cached --name-only
git commit --no-verify -m "feat(frontend-v2): the Content screen shows conversions as they run

One query over GET /api/jobs, polled every five seconds only while a job
is live and never in a hidden tab; a live job makes a row converting with
its percentage and stage, a failed one puts the worker's message at the
top of the inspector, and a row whose job just ended re-reads its
artifacts. Succeeded jobs are ignored: the artifacts already say ready.

Committed with --no-verify: the hook runs the Go gate and this touches no Go.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## After this plan

- **Step 2 of the spec** (catalog-wide SSE) stays deferred until polling proves insufficient.
- **Backend follow-ups filed, not built:** `SubmitConversion` honouring the reconciler's target lock; a per-target artifact summary on `GET /api/jobs` (or a list endpoint) to replace the per-row artifacts fan-out; `PUT …/admins` validating a self-keyed subject.
