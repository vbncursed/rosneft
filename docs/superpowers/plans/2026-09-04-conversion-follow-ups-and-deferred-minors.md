# Conversion follow-ups and the Part 4 deferred minors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the submit/reconciler race and the never-shrinking target index in mesh-service, and clear sixteen frontend-v2 minors the Part 4 reviews deferred.

**Architecture:** In mesh-service the target lock (`andrey:mesh:inflight:{kind}:{slug}`) moves from the reconciler into `SubmitConversion`, which returns the in-flight job when the lock is held; the reconciler stops locking and, at the end of a tick, `HDEL`s every index entry whose target the catalog no longer lists. In frontend-v2 each minor is a spec change followed by the smallest code change that satisfies it; Audit lands in one commit, Metrics and Content in another.

**Tech Stack:** Go 1.25 (mesh-service: go-redis v9, minimock, testify/suite, gotest.tools/assert, testcontainers); frontend-v2: React 19, TypeScript, vitest + Testing Library, TanStack Query, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-04-conversion-follow-ups-and-deferred-minors-design.md`

## Global Constraints

- Branch `feat/frontend-v2-design-system`. Stage by path only: `git add backend/services/mesh-service` or `git add frontend-v2`. **Never stage `.claude/settings.json` or `backend/go.work.sum`** — both are dirty from another session.
- Go commits: run `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check` before committing (gofmt, tidy, vet, golangci-lint, `go test -race -shuffle=on`, govulncheck; ~80 s). The pre-commit hook runs the same target.
- Frontend-only commits: `git commit --no-verify` and the message body says "Frontend-only; the backend gate is skipped with --no-verify because nothing under backend/ changes."
- `yarn`, never `npm`. All frontend commands run from `frontend-v2/`. `tsc --noEmit` type-checks nothing there — `yarn lint` (oxlint + tsgo) is the check.
- frontend-v2 file cap 200 lines (oxlint `max-lines`); `src/architecture.spec.ts` requires a spec per module and a Cosmos fixture per JSX slice.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef
  ```
- Copy rule from the spec: no new user-facing error codes; the 409 path is out of scope.
- Skills each implementer loads first via the Skill tool: `ponytail:ponytail`, `clean-code`, `superpowers:test-driven-development`; frontend tasks add `react-best-practices`, `senior-frontend`, `tailwind-patterns`; Go tasks add `modern-go-guidelines:use-modern-go`, `cc-skills-golang:golang-how-to`.

---

## File map

**Task 1 (Go):**
- Modify `backend/services/mesh-service/internal/service/submit_conversion.go` — lock, contended path, `created` return.
- Modify `backend/services/mesh-service/internal/service/reconcile_missing_artifacts.go` — rename `ReconcileLockTTL` → `TargetLockTTL`, drop the lock calls.
- Modify `backend/services/mesh-service/internal/service/process_job.go` — two comments.
- Modify `backend/services/mesh-service/internal/service/mesh.go` — `Queue` doc comments on the lock methods.
- Modify `backend/services/mesh-service/internal/transport/grpcapi/server.go` and `submit_conversion.go` — new signature.
- Test `backend/services/mesh-service/internal/service/submit_conversion_test.go`, `reconcile_test.go`.

**Task 2 (Go):**
- Modify `mesh.go` — `ForgetTarget` on `Queue`.
- Create `backend/services/mesh-service/internal/storage/forget_target.go`.
- Modify `reconcile_missing_artifacts.go` — the sweep.
- Regenerate `internal/service/mocks/queue_mock.go`.
- Test `reconcile_test.go`, `internal/storage/list_target_jobs_integration_test.go`.

**Task 3 (frontend-v2, Audit):**
- `src/shared/api/client.ts`, `index.ts`, `client.spec.ts` — blob variant.
- `src/entities/audit/api/audit-gateway.ts`, `.spec.ts` — export through the client.
- `src/pages/audit/model/journal.ts`, `.spec.ts` — 24h counting, peak on empty, `windowStart` comment.
- `src/pages/audit/model/use-audit.ts`, `.spec.tsx` — `live` and placeholder data, comment.
- `src/pages/audit/ui/audit-page.tsx`, `audit-screen.tsx`, `audit-screen.spec.tsx`, `audit-page.spec.tsx` — `notice` slot, drop the DOM-shape assertion.

**Task 4 (frontend-v2, Metrics + Content):**
- `src/entities/metric/model/panel-catalog.ts`, `.spec.ts` — `<0.1/s`.
- `src/entities/metric/model/service-health.ts`, `.spec.ts`; new `src/entities/metric/model/match.ts`, `.spec.ts`; `src/entities/metric/index.ts`; `src/pages/metrics/model/focus.ts` — shared `matchesService`.
- `src/shared/ui/line-chart/line-chart.tsx`, `.spec.tsx`, `path.ts`, `path.spec.ts` — `format` prop, lone point.
- `src/widgets/metric-panels/ui/metric-panel.tsx`, `metric-panels.fixture.tsx` — pass the formatter.
- `src/pages/metrics/ui/metrics-page.tsx`, `.spec.tsx` — four columns.
- `src/entities/metric/ui/stat-tile.tsx`, `.spec.tsx` — hidden text instead of `aria-label`.
- `src/pages/metrics/model/dashboard.ts`, `.spec.ts` — `red-latency` out of `GRPC_PANELS`.
- `src/entities/metric/api/metrics-gateway.spec.ts` — spec hygiene.
- `src/pages/metrics/model/use-metrics.spec.tsx` — data-then-error test.
- `src/pages/content/ui/content-screen.tsx`, `.spec.tsx` — row menu names.

---

### Task 1: The target lock moves into `SubmitConversion`

**Files:**
- Modify: `backend/services/mesh-service/internal/service/submit_conversion.go`
- Modify: `backend/services/mesh-service/internal/service/reconcile_missing_artifacts.go`
- Modify: `backend/services/mesh-service/internal/service/process_job.go:20-25, 38-46, 53-56`
- Modify: `backend/services/mesh-service/internal/service/mesh.go:29-38`
- Modify: `backend/services/mesh-service/internal/transport/grpcapi/server.go:21`, `submit_conversion.go:10`
- Test: `backend/services/mesh-service/internal/service/submit_conversion_test.go`, `reconcile_test.go`

**Interfaces:**
- Consumes: `Queue.TryLockTarget(ctx, kind, slug, ttl) (bool, error)`, `Queue.UnlockTarget(ctx, kind, slug) error`, `Queue.ListTargetJobs(ctx) ([]domain.Job, error)` — all exist.
- Produces: `func (m *Mesh) SubmitConversion(ctx, kind domain.Kind, slug string) (job domain.Job, created bool, err error)`; `const TargetLockTTL = 10 * time.Minute` (was `ReconcileLockTTL`). Task 2 relies on the reconciler no longer calling `TryLockTarget`.

- [ ] **Step 1: Write the failing submit tests**

Append to `submit_conversion_test.go` (the suite already has `s.queue`, `s.svc`, `s.ctx`, IDGen `"fixed-id"`):

```go
func (s *SubmitConversionSuite) TestTakesTheTargetLockBeforeQueueing() {
	job := domain.Job{ID: "fixed-id", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusPending}
	s.queue.TryLockTargetMock.Expect(s.ctx, domain.KindTerritory, "t1", service.TargetLockTTL).Return(true, nil)
	s.queue.SaveJobMock.Expect(s.ctx, job).Return(nil)
	s.queue.EnqueueJobMock.Expect(s.ctx, "fixed-id").Return(nil)
	s.queue.GetJobMock.Expect(s.ctx, "fixed-id").Return(job, nil)

	got, created, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), created)
	assert.Equal(s.T(), got.ID, "fixed-id")
}

func (s *SubmitConversionSuite) TestReturnsTheRunningJobWhenTheTargetIsHeld() {
	running := domain.Job{ID: "older", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusRunning}
	s.queue.TryLockTargetMock.Return(false, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{
		{ID: "other", Kind: domain.KindModel, Slug: "t1", Status: domain.JobStatusPending},
		running,
	}, nil)
	// SaveJob and EnqueueJob are unmocked: reaching them fails the test.

	got, created, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !created)
	assert.DeepEqual(s.T(), got, running)
}

func (s *SubmitConversionSuite) TestQueuesAnewWhenTheHeldTargetsJobIsTerminal() {
	// A lock with a finished job behind it is stale: the worker died between
	// its terminal write and the unlock. Nothing is running, so submit.
	job := domain.Job{ID: "fixed-id", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusPending}
	s.queue.TryLockTargetMock.Return(false, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{
		{ID: "older", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusFailed},
	}, nil)
	s.queue.SaveJobMock.Expect(s.ctx, job).Return(nil)
	s.queue.EnqueueJobMock.Expect(s.ctx, "fixed-id").Return(nil)
	s.queue.GetJobMock.Expect(s.ctx, "fixed-id").Return(job, nil)

	got, created, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), created)
	assert.Equal(s.T(), got.ID, "fixed-id")
}

func (s *SubmitConversionSuite) TestQueuesAnewWhenTheHeldTargetHasNoIndexEntry() {
	job := domain.Job{ID: "fixed-id", Kind: domain.KindModel, Slug: "m1", Status: domain.JobStatusPending}
	s.queue.TryLockTargetMock.Return(false, nil)
	s.queue.ListTargetJobsMock.Return(nil, nil)
	s.queue.SaveJobMock.Expect(s.ctx, job).Return(nil)
	s.queue.EnqueueJobMock.Expect(s.ctx, "fixed-id").Return(nil)
	s.queue.GetJobMock.Expect(s.ctx, "fixed-id").Return(job, nil)

	_, created, err := s.svc.SubmitConversion(s.ctx, domain.KindModel, "m1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), created)
}

func (s *SubmitConversionSuite) TestReleasesTheLockWhenSaveFails() {
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.SaveJobMock.Return(errors.New("redis down"))
	s.queue.UnlockTargetMock.Expect(s.ctx, domain.KindTerritory, "t1").Return(nil)

	_, _, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.ErrorContains(s.T(), err, "redis down")
}

func (s *SubmitConversionSuite) TestReleasesTheLockWhenEnqueueFails() {
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.SaveJobMock.Return(nil)
	s.queue.EnqueueJobMock.Return(errors.New("redis full"))
	s.queue.UnlockTargetMock.Expect(s.ctx, domain.KindTerritory, "t1").Return(nil)

	_, _, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.ErrorContains(s.T(), err, "redis full")
}

func (s *SubmitConversionSuite) TestSurfacesALockError() {
	s.queue.TryLockTargetMock.Return(false, errors.New("redis down"))
	_, _, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.ErrorContains(s.T(), err, "redis down")
}
```

Update the five existing tests in the file to the new signature and the lock stub: `TestSavesPendingJobAndEnqueues` and `TestModelKindIsForwarded` gain `s.queue.TryLockTargetMock.Return(true, nil)` and read `got, _, err :=`; `TestSaveFailureSurfaces` and `TestEnqueueFailureSurfaces` gain `TryLockTargetMock.Return(true, nil)` and `UnlockTargetMock.Return(nil)` and read `_, _, err :=`; the two validation tests read `_, _, err :=`.

- [ ] **Step 2: Rewrite the reconcile tests for the new contract**

In `reconcile_test.go`:

```go
// allowSubmit stubs SubmitConversion's fan-out (lock → save → enqueue → get)
// so reconcile can queue missing targets; reconcile only counts the submits.
func (s *ReconcileSuite) allowSubmit() {
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.SaveJobMock.Return(nil)
	s.queue.EnqueueJobMock.Return(nil)
	s.queue.GetJobMock.Return(domain.Job{}, nil)
}
```

Do not stub `ListTargetJobs` in the reconcile suite yet: minimock fails a test whose configured expectation is never called, and nothing in this task's reconciler reads the index. Task 2 adds it.

Replace `TestSkipsTargetAlreadyInFlight` with:

```go
func (s *ReconcileSuite) TestDoesNotCountATargetAlreadyInFlight() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(false, nil)
	s.queue.TryLockTargetMock.Return(false, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{
		{ID: "j1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusRunning},
	}, nil)

	n, err := s.svc.ReconcileMissingArtifacts(s.T().Context())

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), 0, n)
	// SaveJob is not configured on the mock: the controller fails the test if
	// the reconciler reaches it, which is exactly the regression we guard.
}
```

`TestQueuesTargetWhenLockIsFree` and `TestQueuesOnlyMissingTargets` keep their assertions. `TestStopsOnSubmitFailure` and `TestReleasesLockWhenSubmitFails` keep their stubs — the unlock now happens inside `SubmitConversion`, so `UnlockTargetMock.Return(nil)` stays required.

- [ ] **Step 3: Run the two suites to see them fail**

Run: `cd backend/services/mesh-service && go test ./internal/service/ -run 'SubmitConversion|Reconcile' 2>&1 | head -30`
Expected: compile errors — `service.TargetLockTTL` undefined, `SubmitConversion` returns 2 values.

- [ ] **Step 4: Implement `SubmitConversion`**

Replace the body of `submit_conversion.go`:

```go
package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// SubmitConversion validates the request, claims the target, persists a
// Pending job and pushes it onto the conversion queue. Kind selects which
// catalog entity (territory or model) the job is targeting; the worker uses
// Kind to decide which catalog table receives the resulting artifacts.
//
// The claim is what serialises a user-initiated submit against the
// reconciler: with both submitting freely, two jobs ran for one target and
// the older one's terminal write could land last in the index. When the
// claim is held and the index shows a live job, that job is returned with
// created=false — the caller wanted a job to follow, and this is it. A held
// claim with no live job behind it is a stale lock (a worker that died
// between its terminal write and the unlock), so the submit goes ahead.
func (m *Mesh) SubmitConversion(ctx context.Context, kind domain.Kind, slug string) (domain.Job, bool, error) {
	if kind == domain.KindUnspecified {
		return domain.Job{}, false, fmt.Errorf("%w: kind is required", domain.ErrInvalidInput)
	}
	if slug == "" {
		return domain.Job{}, false, fmt.Errorf("%w: slug is required", domain.ErrInvalidInput)
	}

	locked, err := m.queue.TryLockTarget(ctx, kind, slug, TargetLockTTL)
	if err != nil {
		return domain.Job{}, false, fmt.Errorf("service.SubmitConversion: lock: %w", err)
	}
	if !locked {
		live, err := m.liveJob(ctx, kind, slug)
		if err != nil {
			return domain.Job{}, false, err
		}
		if live != nil {
			return *live, false, nil
		}
	}

	job := domain.Job{
		ID:     m.idGen(),
		Kind:   kind,
		Slug:   slug,
		Status: domain.JobStatusPending,
	}
	if err := m.queue.SaveJob(ctx, job); err != nil {
		_ = m.queue.UnlockTarget(ctx, kind, slug)
		return domain.Job{}, false, fmt.Errorf("service.SubmitConversion: save: %w", err)
	}
	if err := m.queue.EnqueueJob(ctx, job.ID); err != nil {
		_ = m.queue.UnlockTarget(ctx, kind, slug)
		return domain.Job{}, false, fmt.Errorf("service.SubmitConversion: enqueue: %w", err)
	}
	saved, err := m.queue.GetJob(ctx, job.ID)
	if err != nil {
		return domain.Job{}, false, err
	}
	return saved, true, nil
}

// liveJob is the target's latest job if it is still pending or running, else
// nil. Read through the whole index: the contended path is rare and the
// index is catalog-sized.
// ponytail: O(catalog) per contended submit; an HGET on the index field if
// submits ever contend at scale.
func (m *Mesh) liveJob(ctx context.Context, kind domain.Kind, slug string) (*domain.Job, error) {
	jobs, err := m.queue.ListTargetJobs(ctx)
	if err != nil {
		return nil, fmt.Errorf("service.SubmitConversion: index: %w", err)
	}
	for _, j := range jobs {
		if j.Kind != kind || j.Slug != slug {
			continue
		}
		if j.Status == domain.JobStatusPending || j.Status == domain.JobStatusRunning {
			return &j, nil
		}
		return nil, nil
	}
	return nil, nil
}
```

Note the unlock on the save/enqueue failure paths runs even when the lock was not ours (stale-lock fallthrough): releasing a stale lock early is harmless — that is what the TTL would do.

- [ ] **Step 5: Update the reconciler, the constant, the comments and the gRPC contract**

`reconcile_missing_artifacts.go`: rename the constant and its comment's first line to `// TargetLockTTL bounds how long a claimed target stays claimed if the worker dies between claiming it and finishing …` (keep the measurement paragraph verbatim), then replace the loop body from the `locked, err :=` line to the `queued++` line with:

```go
		// SubmitConversion holds the target claim; when the target is already
		// in flight it hands back that job and created is false.
		_, created, err := m.SubmitConversion(ctx, t.Kind, t.Slug)
		if err != nil {
			return queued, fmt.Errorf("service.ReconcileMissingArtifacts: submit %s/%s: %w", t.Kind, t.Slug, err)
		}
		if !created {
			continue
		}
		slog.InfoContext(ctx, "reconcile: queued conversion", "kind", t.Kind, "slug", t.Slug)
		queued++
```

Keep the `HasLOD0` comment above it, reworded: "HasLOD0 stays false for the entire conversion — the artifact is published last — so without the claim SubmitConversion takes, a conversion longer than the tick interval would be queued again on every tick."

`process_job.go`: in the doc comment replace "the reconciler's claim on the target is released" with "the target claim SubmitConversion took is released"; replace the `ReconcileLockTTL` mention in the failure-path comment with `TargetLockTTL`; replace the comment `// A user-initiated conversion holds no claim, so this is a no-op for that path.` with `// Every job holds the claim now — SubmitConversion took it.`; `unlockTarget`'s comment: "releases the claim on job's target".

`mesh.go`: the `TryLockTarget` comment becomes "TryLockTarget claims a target for one conversion. Reports false when another attempt already holds it. The lock is what stops the reconciler re-queueing an entity whose conversion is still running, and what stops a user-initiated submit racing the reconciler: …" (keep the HasLOD0 sentence).

`grpcapi/server.go:21`: `SubmitConversion(ctx context.Context, kind domain.Kind, slug string) (domain.Job, bool, error)`. `grpcapi/submit_conversion.go:10`: `job, _, err := s.svc.SubmitConversion(...)`.

Grep for other callers: `grep -rn 'SubmitConversion(' backend/services/mesh-service --include='*.go'` — bootstrap only mentions it in comments.

- [ ] **Step 6: Run the suites**

Run: `cd backend/services/mesh-service && go test ./internal/service/ ./internal/transport/... 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 7: Full gate and commit**

Run: `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check`
Expected: green.

```bash
git add backend/services/mesh-service
git commit -m "fix(mesh): SubmitConversion takes the target claim, and hands back the job already in flight

A gateway submit never looked at the reconciler's lock, so a user's
replace-source and a reconcile tick could run two jobs for one target and
the older one's terminal write could win the index. The claim now lives in
SubmitConversion; a held claim with a live job returns that job
(created=false), a held claim with nothing live behind it is stale and the
submit goes ahead. The reconciler stops locking and counts only what it
created.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

### Task 2: The reconciler sweeps the target index

**Files:**
- Modify: `backend/services/mesh-service/internal/service/mesh.go:17-38` (Queue interface)
- Create: `backend/services/mesh-service/internal/storage/forget_target.go`
- Modify: `backend/services/mesh-service/internal/service/reconcile_missing_artifacts.go`
- Regenerate: `backend/services/mesh-service/internal/service/mocks/queue_mock.go`
- Test: `backend/services/mesh-service/internal/service/reconcile_test.go`, `backend/services/mesh-service/internal/storage/list_target_jobs_integration_test.go`

**Interfaces:**
- Consumes: `SubmitConversion(ctx, kind, slug) (domain.Job, bool, error)` from Task 1; `Catalog.ListTargets`, `Queue.ListTargetJobs`.
- Produces: `Queue.ForgetTarget(ctx context.Context, kind domain.Kind, slug string) error`; `(*storage.Redis).ForgetTarget`.

- [ ] **Step 1: Add `ForgetTarget` to the contract and regenerate the mock**

In `mesh.go`, after `UnlockTarget` in the `Queue` interface:

```go
	// ForgetTarget drops the target's entry from the index. The job hash
	// stays: a subscriber holding the id must still be able to read it.
	ForgetTarget(ctx context.Context, kind domain.Kind, slug string) error
```

Run: `cd backend/services/mesh-service/internal/service && go generate ./...`
Expected: `mocks/queue_mock.go` gains `ForgetTargetMock`. If `go generate` reports minimock missing, it is at `~/go/bin/minimock`; put `~/go/bin` on PATH.

- [ ] **Step 2: Write the failing reconcile tests**

Append to `reconcile_test.go`:

```go
func (s *ReconcileSuite) TestForgetsIndexEntriesWhoseTargetTheCatalogNoLongerLists() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "kept", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(true, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{
		{ID: "j1", Kind: domain.KindTerritory, Slug: "kept", Status: domain.JobStatusSucceeded},
		{ID: "j2", Kind: domain.KindTerritory, Slug: "gone", Status: domain.JobStatusFailed},
		{ID: "j3", Kind: domain.KindModel, Slug: "kept", Status: domain.JobStatusFailed},
	}, nil)
	// Only the two absent from the catalog: the territory "gone" and the
	// model "kept" — same slug as the territory, different kind.
	s.queue.ForgetTargetMock.When(s.ctx, domain.KindTerritory, "gone").Then(nil)
	s.queue.ForgetTargetMock.When(s.ctx, domain.KindModel, "kept").Then(nil)

	_, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(s.queue.ForgetTargetMock.Calls()), 2)
}

func (s *ReconcileSuite) TestASweepErrorDoesNotFailTheTick() {
	s.catalog.ListTargetsMock.Return(nil, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{
		{ID: "j2", Kind: domain.KindTerritory, Slug: "gone", Status: domain.JobStatusFailed},
	}, nil)
	s.queue.ForgetTargetMock.Return(errors.New("redis blip"))

	queued, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), queued, 0)
}

func (s *ReconcileSuite) TestAnIndexReadErrorDoesNotFailTheTick() {
	s.catalog.ListTargetsMock.Return(nil, nil)
	s.queue.ListTargetJobsMock.Return(nil, errors.New("redis blip"))

	_, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.NilError(s.T(), err)
}

func (s *ReconcileSuite) TestNoSweepAfterALoopError() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(false, errors.New("db blip"))
	// ListTargetJobs and ForgetTarget are unmocked: reaching them fails the test.

	_, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.ErrorContains(s.T(), err, "db blip")
}
```

The sweep reads the index after every completed loop, so add `s.queue.ListTargetJobsMock.Return(nil, nil)` to `allowSubmit` and to `TestNothingToReconcileWhenAllHaveLOD0`. `TestDoesNotCountATargetAlreadyInFlight` already stubs it. Tests that return early (`TestStopsOnListTargetsError`, `TestSurfaceLOD0CheckErrorOnFirstFailure`, `TestStopsOnSubmitFailure`, `TestRespectsCancelledContext`, `TestReleasesLockWhenSubmitFails`) must not get one — minimock fails on an expectation never called.

- [ ] **Step 3: Run to see them fail**

Run: `cd backend/services/mesh-service && go test ./internal/service/ -run Reconcile 2>&1 | tail -20`
Expected: the three new tests fail (`ForgetTarget` never called / `ListTargetJobs` unexpected call).

- [ ] **Step 4: Implement the sweep**

In `reconcile_missing_artifacts.go`, replace the final `return queued, nil` with `m.sweepIndex(ctx, targets)` followed by `return queued, nil`, and add:

```go
// sweepIndex drops index entries for targets the catalog no longer lists —
// a deleted territory or model otherwise keeps its last job in GET /api/jobs
// forever. Errors are logged, not returned: the queueing half of the tick
// already happened, and the next tick sweeps again.
func (m *Mesh) sweepIndex(ctx context.Context, targets []domain.ConversionTarget) {
	live := make(map[string]struct{}, len(targets))
	for _, t := range targets {
		live[t.Kind.String()+":"+t.Slug] = struct{}{}
	}
	jobs, err := m.queue.ListTargetJobs(ctx)
	if err != nil {
		slog.WarnContext(ctx, "reconcile: index read failed", "err", err)
		return
	}
	for _, j := range jobs {
		if _, ok := live[j.Kind.String()+":"+j.Slug]; ok {
			continue
		}
		if err := m.queue.ForgetTarget(ctx, j.Kind, j.Slug); err != nil {
			slog.WarnContext(ctx, "reconcile: forget target failed", "kind", j.Kind, "slug", j.Slug, "err", err)
			continue
		}
		slog.InfoContext(ctx, "reconcile: forgot deleted target", "kind", j.Kind, "slug", j.Slug)
	}
}
```

`domain.Kind` has a `String()` (it is printed with `%s` in the file already); confirm with `grep -n 'func (k Kind) String' internal/domain/*.go`. Add `"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"` to the imports.

Create `internal/storage/forget_target.go`:

```go
package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// ForgetTarget removes the target's index entry. HDEL of a missing field is
// not an error, so a sweep that races another replica's sweep is fine. The
// job hash is left alone: GetJob by id keeps answering.
func (r *Redis) ForgetTarget(ctx context.Context, kind domain.Kind, slug string) error {
	if err := r.client.HDel(ctx, targetsKey, targetField(kind, slug)).Err(); err != nil {
		return fmt.Errorf("storage.ForgetTarget: hdel: %w", err)
	}
	return nil
}
```

- [ ] **Step 5: Write the integration case**

Append to `list_target_jobs_integration_test.go`:

```go
func (s *TargetIndexSuite) TestForgetTargetDropsTheEntryAndKeepsTheJob() {
	ctx := s.T().Context()
	assert.NilError(s.T(), s.store.SaveJob(ctx, domain.Job{ID: "gone-1", Kind: domain.KindTerritory, Slug: "gone", Status: domain.JobStatusFailed}))

	assert.NilError(s.T(), s.store.ForgetTarget(ctx, domain.KindTerritory, "gone"))
	// Idempotent: a second sweep, or another replica's, finds nothing to drop.
	assert.NilError(s.T(), s.store.ForgetTarget(ctx, domain.KindTerritory, "gone"))

	got, err := s.store.ListTargetJobs(ctx)
	assert.NilError(s.T(), err)
	for _, j := range got {
		assert.Assert(s.T(), j.Slug != "gone", "index still lists the forgotten target")
	}
	old, err := s.store.GetJob(ctx, "gone-1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), old.Status, domain.JobStatusFailed)
}
```

Run: `cd backend/services/mesh-service && go test -tags=integration ./internal/storage/ -run TargetIndex 2>&1 | tail -5` (needs Docker running).
Expected: PASS. If Docker is not running, say so in the report rather than skipping silently.

- [ ] **Step 6: Run the unit suites, the gate, commit**

Run: `cd backend/services/mesh-service && go test ./... 2>&1 | tail -10` then `CC=/usr/bin/clang SDKROOT=$(xcrun --show-sdk-path) make -C backend check`.
Expected: green.

```bash
git add backend/services/mesh-service
git commit -m "fix(mesh): the reconciler forgets index entries for deleted targets

Nothing removed a target from andrey:mesh:targets when its territory or
model was deleted, so the last job stayed in GET /api/jobs for Root as a
phantom row. The reconciler already holds the catalog's target list every
tick; it now HDELs every index entry outside it. The job hash stays so an
open SSE subscription can still read its job. A sweep error is logged and
the tick succeeds — the queueing half already happened.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

### Task 3: Audit minors

**Files:**
- Modify: `frontend-v2/src/shared/api/client.ts`, `frontend-v2/src/shared/api/index.ts`
- Test: `frontend-v2/src/shared/api/client.spec.ts`
- Modify: `frontend-v2/src/entities/audit/api/audit-gateway.ts:64-83`
- Test: `frontend-v2/src/entities/audit/api/audit-gateway.spec.ts`
- Modify: `frontend-v2/src/pages/audit/model/journal.ts:113-156`
- Test: `frontend-v2/src/pages/audit/model/journal.spec.ts:128-162`
- Modify: `frontend-v2/src/pages/audit/model/use-audit.ts:55-58, 108`
- Test: `frontend-v2/src/pages/audit/model/use-audit.spec.tsx`
- Modify: `frontend-v2/src/pages/audit/ui/audit-page.tsx`, `frontend-v2/src/pages/audit/ui/audit-screen.tsx`
- Test: `frontend-v2/src/pages/audit/ui/audit-screen.spec.tsx:108-119`, `frontend-v2/src/pages/audit/ui/audit-page.spec.tsx`

**Interfaces:**
- Produces: `httpGetBlob(path: string): Promise<Blob>` exported from `@/shared/api`; `AuditPageProps.notice?: ReactNode`; `countersOf(entries, now, capped, actorCount)` — **new `now` parameter in second position**; `activityOf` unchanged.

- [ ] **Step 1: `httpGetBlob` — failing test**

Append to `client.spec.ts` inside `describe("http client")` (the file stubs `fetch` as `fetchMock`, and has a `location` stub used by the 401 tests — copy the setup those tests use):

```ts
  it("fetches a blob through the same base URL and 401 bounce as JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("a,b\n", { status: 200, headers: { "Content-Type": "text/csv" } }));
    const blob = await httpGetBlob("/api/audit.csv");
    expect(await blob.text()).toBe("a,b\n");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${import.meta.env.VITE_API_URL}/api/audit.csv`);
    expect((init.headers as Record<string, string>).Accept).toBe("*/*");
  });
```

and, next to the existing 401 test, a second one that calls `httpGetBlob` and asserts the same `clearAuthed` / `location.assign` outcome that test asserts for `httpGet`. Import `httpGetBlob` from `./client`.

- [ ] **Step 2: Implement**

`client.ts`: change `send`'s third parameter to `parse: "json" | "blob" | "none"`; the tail becomes:

```ts
  if (parse === "none" || res.status === 204) return undefined as T;
  return (parse === "blob" ? await res.blob() : await res.json()) as T;
```

Update the five callers (`true` → `"json"`, `false` → `"none"`) and add:

```ts
/** A file, not JSON: the CSV export. `Accept` is widened so the gateway's CSV route is not asked for JSON. */
export function httpGetBlob(path: string): Promise<Blob> {
  return send<Blob>(path, { headers: { Accept: "*/*" } }, "blob");
}
```

`index.ts`: add `httpGetBlob` to the client export line.

- [ ] **Step 3: Export through the client — spec then code**

In `audit-gateway.spec.ts`, the CSV test's expectation stays as is; delete `names the status when the refusal carries no sentence of its own` (that path is now `client.ts`'s and tested there) and add:

```ts
  it("sends the export through the shared client, so a 401 bounces like every other call", async () => {
    fetchMock.mockResolvedValueOnce(new Response("upstream down", { status: 502 }));
    await expect(exportAuditCsv({})).rejects.toMatchObject({ status: 502, message: "Request failed (502)" });
  });
```

(`client.ts` falls back to `res.statusText || "Request failed (502)"`; a `Response` built in jsdom has an empty statusText, so the fallback shows.)

Then `audit-gateway.ts`: replace lines 64-83 with

```ts
/** The same journal as CSV. Goes through the client so it shares the base URL and the 401 bounce. */
export const exportAuditCsv = (filters: AuditFilters): Promise<Blob> =>
  httpGetBlob(`/api/audit.csv${toQuery(filters, null, null)}`);
```

and change the import to `import { httpGet, httpGetBlob } from "@/shared/api";` — `HttpError` and `ApiError` are no longer used there.

- [ ] **Step 4: 24-hour counters and the empty peak — spec then code**

In `journal.spec.ts`, inside `describe("activityOf and countersOf")`:

```ts
  it("counts the same 24 buckets the strip draws — not the 25th hour the query may return", () => {
    const entries = [
      entry({ at: "2026-09-01T10:05:00Z" }),
      entry({ at: "2026-08-31T11:30:00Z", result: "failed" }),
      entry({ at: "2026-08-31T10:30:00Z", result: "failed" }), // rounded-down window start: outside the strip
    ];
    expect(countersOf(entries, NOW, false, 9)).toEqual([
      { label: "Events · 24h", value: "2" },
      { label: "Failed · 24h", value: "1", tone: "bad" },
      { label: "Actors", value: "9", tone: "accent" },
    ]);
  });

  it("says there were no events rather than a peak of zero", () => {
    expect(activityOf([], NOW, false).detail).toBe("no events in the last 24h");
  });
```

Update the existing `countersOf` calls in the file to pass `NOW` second (`countersOf([entry(), entry({ result: "failed" })], NOW, false, 9)` etc.). `NOW` is `2026-09-01T10:30:00Z` and `entry()` defaults are at the top of the spec (lines 16-17); if `entry()`'s default `at` falls outside the 24 buckets of `NOW`, pass an explicit `at` inside them.

`journal.ts`: extract the bucketing —

```ts
/** Index of the strip bucket an entry falls in, or -1 outside the 24 drawn. */
const bucketOf = (at: string, now: Date): number => {
  const startOf = (d: Date) => Math.floor(d.getTime() / HOUR_MS);
  const i = startOf(new Date(at)) - startOf(hourOf(now, 0));
  return i >= 0 && i < 24 ? i : -1;
};
```

`activityOf` uses `bucketOf`; its detail becomes

```ts
  const detail = capped
    ? `from ${WINDOW_LIMIT} loaded events`
    : peak === 0
      ? "no events in the last 24h"
      : `peak ${peak}/h at ${String(at.getUTCHours()).padStart(2, "0")}:00`;
```

`countersOf(entries, now, capped, actorCount)` filters first: `const inWindow = entries.filter((e) => bucketOf(e.at, now) >= 0);` and counts from `inWindow`. Add a comment: "The window query is rounded down to the hour and may hold a 25th hour; the strip draws 24, and the counters must agree with the strip." Update the call in `audit-screen.tsx:63` to `countersOf(s.window.entries, now, s.window.capped, s.actors.length)`.

Fix the `windowStart` doc comment (journal.ts:113-118) and the one in `use-audit.ts:55-57`: replace "It advances once an hour" / "advances once an hour" with "It advances to the next hour on the next render — nothing re-renders an idle tab, and a paged tab that sits still keeps its hour, which is accepted."

- [ ] **Step 5: `live` and placeholder data — spec then code**

In `use-audit.spec.tsx`, inside `keeps the loaded page and stays ready while a new filter loads`, after `act(() => result.current.setQuery("entity:territory"));` add:

```ts
    // The page on screen is the previous filter's — "live" would claim the
    // journal is following events it is not showing.
    expect(result.current.live).toBe(false);
```

and at the end of the test, after the final `expect(result.current.status).toBe("ready")`:

```ts
    await waitFor(() => expect(result.current.live).toBe(true));
```

`use-audit.ts:108`: `live: (journal.data?.pages.length ?? 0) <= 1 && !journal.isPlaceholderData && unknownActor === null && !backwards,`.

- [ ] **Step 6: Callouts below the heading — spec then code**

In `audit-screen.spec.tsx`, delete the two-line `expect(from.closest("div")!.parentElement).toBe(...)` assertion (lines 116-118) and add a test:

```ts
  it("puts an empty-result sentence below the heading, not above the page", () => {
    useAudit.mockReturnValue(state({ entries: [] }));
    render(<AuditScreen />);
    const heading = screen.getByRole("heading", { level: 1, name: "Audit journal" });
    const callout = screen.getByText("No events match this filter.");
    expect(heading.compareDocumentPosition(callout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
```

(`state()` in that spec builds a `useAudit` return; pass `entries: []` the way its other tests override fields — read the helper first.)

In `audit-page.spec.tsx` add:

```ts
  it("renders a notice between the header and the filter row", () => {
    render(<AuditPage {...props()} notice={<p>Nothing here</p>} />);
    const heading = screen.getByRole("heading", { level: 1 });
    const notice = screen.getByText("Nothing here");
    expect(heading.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const filter = screen.getByRole("textbox", { name: "Filter events" });
    expect(notice.compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
```

(`props()` — whatever that spec's props builder is called; read it.)

`audit-page.tsx`: add `/** A sentence the screen wants under the header — a refusal or an empty result. */ notice?: ReactNode;` to the props, destructure it, and render `{notice}` between `</header>` and the filter `<div>`. `audit-screen.tsx`: move the callout ternary out of the fragment into `notice={…}` on `<AuditPage>`; the fragment wrapper goes away.

- [ ] **Step 7: Lint, tests, commit**

Run from `frontend-v2/`: `yarn lint && yarn test:coverage 2>&1 | tail -15`
Expected: lint silent, all tests pass, thresholds hold.

```bash
git add frontend-v2
git commit --no-verify -m "fix(frontend-v2): audit counters agree with the strip, the export shares the client, the notices sit under the heading

Frontend-only; the backend gate is skipped with --no-verify because
nothing under backend/ changes.

countersOf counted the 25th hour the rounded-down window query returns;
it now counts the strip's 24 buckets. An empty window says so instead of
'peak 0/h'. exportAuditCsv goes through httpGetBlob — same base URL, same
401 bounce as every other call. The live badge is off while the page on
screen is placeholder data. The three callouts render below the h1
through AuditPage's notice slot; the screen spec no longer reaches into
DatePicker's DOM.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

### Task 4: Metrics and Content minors

**Files:**
- Modify: `frontend-v2/src/entities/metric/model/panel-catalog.ts:47-64`; Test `panel-catalog.spec.ts:23-33`
- Create: `frontend-v2/src/entities/metric/model/match.ts`, `match.spec.ts`
- Modify: `frontend-v2/src/entities/metric/model/service-health.ts:27`, `frontend-v2/src/entities/metric/index.ts`, `frontend-v2/src/pages/metrics/model/focus.ts:15-27`; Test `service-health.spec.ts`
- Modify: `frontend-v2/src/shared/ui/line-chart/line-chart.tsx:16-24, 51-61`, `path.ts:49-63`; Test `line-chart.spec.tsx`, `path.spec.ts`
- Modify: `frontend-v2/src/widgets/metric-panels/ui/metric-panel.tsx`, `frontend-v2/src/widgets/metric-panels/metric-panels.fixture.tsx:20`
- Modify: `frontend-v2/src/pages/metrics/ui/metrics-page.tsx:117-123`; Test `metrics-page.spec.tsx:158-168`
- Modify: `frontend-v2/src/entities/metric/ui/stat-tile.tsx:64-73`; Test `stat-tile.spec.tsx`
- Modify: `frontend-v2/src/pages/metrics/model/dashboard.ts:66-70`; Test `dashboard.spec.ts:141-165`
- Test only: `frontend-v2/src/entities/metric/api/metrics-gateway.spec.ts`, `frontend-v2/src/pages/metrics/model/use-metrics.spec.tsx`
- Modify: `frontend-v2/src/pages/content/ui/content-screen.tsx:64`; Test `content-screen.spec.tsx:105-151`

**Interfaces:**
- Produces: `matchesService(label: string, name: string): boolean` from `@/entities/metric` (case-insensitive containment either way); `LineChartProps.format?: (v: number) => string`; `MetricPanelProps.unit?: Unit`.

- [ ] **Step 1: `<0.1/s` for a non-zero rate that rounds to nothing**

`panel-catalog.spec.ts`, in `formats by unit`: add `expect(formatValue(0.04, "rps")).toBe("<0.1/s");` and `expect(formatValue(0, "rps")).toBe("0/s");`. In `service-health.spec.ts` change the catalog fixture to `one("catalog", 0.04)` in the errors array and expect `["catalog", "degraded", "24ms", "<0.1/s"]`; keep the `0/s` case by adding `one("mesh-worker", 0)` to errors and expecting `["mesh-worker", "up", "—", "0/s"]`.

`panel-catalog.ts`:

```ts
// A rate that is not zero must not print as one: the health row calls a
// service degraded on err > 0, and "0 errors/s" beside DEGRADED reads as a
// contradiction.
const rate = (v: number) => (v > 0 && v < 0.05 ? "<0.1" : String(round(v)));
```

and `case "rps": return `${rate(v)}/s`;`. `service-health.ts:32` builds meta with `.replace("/s", "")` — `<0.1 errors/s` reads fine, leave it.

- [ ] **Step 2: One `matchesService`**

Create `entities/metric/model/match.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { matchesService } from "./match";

describe("matchesService", () => {
  it("matches a gRPC service name against the scrape name it contains, either way round", () => {
    expect(matchesService("rosneft.catalog.v1.CatalogService", "catalog")).toBe(true);
    expect(matchesService("mesh", "rosneft.mesh.v1.MeshService")).toBe(true);
    expect(matchesService("Gateway", "gateway")).toBe(true);
    expect(matchesService("audit", "catalog")).toBe(false);
  });
});
```

`match.ts`:

```ts
/**
 * A `grpc_service` is a fully-qualified name (`rosneft.mesh.v1.MeshService`)
 * and a scrape name is short (`mesh-worker`, `mesh`), so pairing them is
 * containment either way round, case-insensitively. A convention, not a
 * guarantee: an unrelated pair sharing a substring would match. The health
 * list and the panel focus share it so a service selected in one is the
 * service paired in the other.
 */
export function matchesService(label: string, name: string): boolean {
  const a = label.toLowerCase();
  const b = name.toLowerCase();
  return a.includes(b) || b.includes(a);
}
```

Export from `entities/metric/index.ts`: `export { matchesService } from "./model/match";`. `service-health.ts:27`: `const lat = last(latency.find((s) => matchesService(s.label, name)));` (import from `./match`; drop the doc-comment's "containing the scrape name" wording for "paired by name, see matchesService"). `focus.ts`: delete `isSelected` and its comment, import `matchesService` from `@/entities/metric`, use `matchesService(serviceOf(s)!, selected)`. Rerun `focus.spec.ts` — its containment test (line 39) already covers both directions.

- [ ] **Step 3: Chart summary in the panel's own format; the lone point**

`line-chart.spec.tsx`: change the first test to `<LineChart series={SERIES} label="Request latency" format={(v) => `${v} ms`} />` with the same expected name, and add:

```ts
  it("speaks the reading the way the panel prints it, given a formatter", () => {
    render(<LineChart series={[{ label: "p99", values: [0.0523] }]} label="Latency" format={(v) => `${Math.round(v * 1000)}ms`} />);
    expect(screen.getByRole("img", { name: "Latency: p99 52ms" })).toBeInTheDocument();
  });
```

Keep the `unit="ms"` tests as they are — `unit` stays for callers without a formatter.

`line-chart.tsx`: add to props `/** How the panel prints a value; the spoken summary uses it so a reader hears "52ms", not "0.0523 seconds". */ format?: (v: number) => string;` and in `summarise`:

```ts
    return `${s.label} ${format ? format(last) : `${Number(last.toFixed(2))}${unit ? ` ${unit}` : ""}`}`;
```

(`summarise(series, label, unit, format)`; pass `format` through from the component.)

`metric-panel.tsx`: `unit?: Unit` (import `type Unit, formatValue` from `@/entities/metric`), and `<LineChart className="mt-3" series={series} label={title} format={unit ? (v) => formatValue(v, unit) : undefined} />`. `metric-panels.fixture.tsx:20`: `unit: "seconds"`. Check `MetricPanelEntry` consumers in `dashboard.ts` still type-check — they pass `unit` from `PANELS`, which is a `Unit`.

`path.spec.ts`, in `describe("toLinePath")`:

```ts
  it("draws a lone reading between two gaps as a short flat dash, not nothing", () => {
    const d = toLinePath([null, 5, null, null], 10);
    expect(d).toMatch(/^M100\.0 \d+\.\d L\d+\.\d \d+\.\d$/);
  });
```

`path.ts`: after the `forEach`, points with no drawn neighbour get a dash. Replace the loop body with:

```ts
  values.forEach((value, i) => {
    if (value === null) {
      drawing = false;
      return;
    }
    const x = i * step;
    const y = scaleY(value, max, geo).toFixed(1);
    const alone = !drawing && (i === values.length - 1 || values[i + 1] === null);
    segments.push(`${drawing ? "L" : "M"}${x.toFixed(1)} ${y}`);
    // A reading with no neighbour on either side is a point nobody can see;
    // give it the same flat dash a single-value series gets, one step wide.
    if (alone) segments.push(`L${Math.min(x + step / 2, geo.width).toFixed(1)} ${y}`);
    drawing = true;
  });
```

Run the whole `path.spec.ts` — the existing gap test (`breaks the line at a gap`) asserts a fresh `M` after the gap; confirm it still holds and adjust its expectation only if it counted segments.

- [ ] **Step 4: Four columns without a budget**

`metrics-page.spec.tsx:158-168`: rename to `lays out four tiles without a budget — the grid has no empty fifth column`, build `["Requests", "Errors", "p99", "Queue"]`, expect `lg:grid-cols-4` and `4` children. `metrics-page.tsx:122`: `"sm:grid-cols-2 lg:grid-cols-4"`.

- [ ] **Step 5: StatTile without `aria-label` on a `<p>`**

`stat-tile.spec.tsx`: every `screen.getByLabelText("X: y")` becomes `screen.getByText("X: y")` for the hidden span; assertions on `className` read `.parentElement!.className`; `toHaveTextContent("…")` becomes `expect(screen.getByText("…")).toBeInTheDocument()`. The `omits the hint line entirely` test counts `<p>` — still two.

`stat-tile.tsx:64-73`:

```tsx
      <p
        className={cx(
          "m-0 font-mono",
          size === "lg" ? "mt-2.5 text-[26px] leading-none" : "mt-1.5 text-[22px]",
          TONE[valueTone],
        )}
      >
        {/* A paragraph cannot carry an accessible name, so the spoken form is
            text: the glyph is hidden and the sentence is visually hidden. */}
        <span aria-hidden="true">{readout(state)}</span>
        <span className="sr-only">{readoutLabel(label, state)}</span>
      </p>
```

Other specs query tiles by label and must switch to `getByText` (with `.parentElement!.className` where a class is asserted): `pages/metrics/ui/metrics-page.spec.tsx:109,183,184`, `pages/metrics/ui/metrics-screen.spec.tsx:224`, `pages/territory-access/ui/territory-access-page.spec.tsx:94`, `pages/content/ui/content-page.spec.tsx:85`, `pages/audit/ui/audit-page.spec.tsx:127`, `pages/roles/ui/roles-page.spec.tsx:91-92`. `roles-screen.spec.tsx:82` labels a skeleton, not a tile — leave it. Confirm with `grep -rn 'getByLabelText' src --include='*.spec.tsx'` before finishing.

- [ ] **Step 6: `red-latency` leaves `GRPC_PANELS`**

`dashboard.spec.ts`: add next to `says a gRPC panel with no traffic is quiet, not broken`:

```ts
  it("does not read an empty latency quantile as 'no traffic' — a missing p99 is a missing p99", () => {
    const e = panelEntry("red-latency", { kind: "value", series: [] });
    expect(e.meta).toBe(PANELS["red-latency"].meta);
    expect(e.lastTone).toBeUndefined();
  });
```

The existing `shortens gRPC method legends, and only in the gRPC group` test (line 166) may use `red-latency` for the short-label case — if so, keep labels short for it by splitting the sets: `dashboard.ts` gets

```ts
/** Panels whose legends carry gRPC names to shorten. */
const GRPC_LABELLED: ReadonlySet<PanelId> = new Set<PanelId>(["red-rate", "red-errors", "red-latency"]);
/** Rate panels where an empty answer means a quiet window; a quantile with no samples is not "no traffic". */
const GRPC_QUIET: ReadonlySet<PanelId> = new Set<PanelId>(["red-rate", "red-errors"]);
```

with the empty-panel branch on `GRPC_QUIET` and the `shortGrpcLabel` map on `GRPC_LABELLED`.

- [ ] **Step 7: Spec hygiene in the metrics gateway, and the data-then-error test**

`metrics-gateway.spec.ts`: delete `setCsrfToken("csrf");` and its import; rename the last test to `rejects with the status and the gateway's message on failure` and make the body JSON: `fetchMock.mockResolvedValueOnce(json({ code: "unavailable", message: "Prometheus unreachable" }, 502));` expecting `message: "Prometheus unreachable"`.

`use-metrics.spec.tsx`, after `keeps the screen ready when one panel fails`:

```ts
  it("keeps a panel's last data on screen when its refetch fails — stale beats empty", async () => {
    const { result } = renderHook(() => useMetrics("1h"), { wrapper });
    await waitFor(() => expect(result.current.results["red-rate"]?.kind).toBe("value"));

    failing.add("red-rate");
    await act(() => client.refetchQueries({ queryKey: ["metrics", "red-rate"] }));

    expect(result.current.results["red-rate"]).toEqual({
      kind: "value",
      series: [{ label: "gateway", points: points(140, 142), labels: {} }],
    });
  });
```

`panelQuery`'s key is `["metrics", panel, range]` (`entities/metric/api/panel-query.ts:11`), so the call is `client.refetchQueries({ queryKey: ["metrics", "red-rate", "1h"] })`.

- [ ] **Step 8: Row menus named for their row**

`content-screen.spec.tsx`: every `{ name: "Row actions" }` becomes `{ name: "Row actions for T 1" }` / `"Row actions for M 1"` matching the row queried; the `offers no row menu` test uses `{ name: /^Row actions for / }`. `content-screen.tsx:64`: `triggerLabel={`Row actions for ${item.title}`}` — `ContentItem.title` is a required string (`entities/content/model/content-item.ts:12`).

- [ ] **Step 9: Lint, tests, live check, commit**

Run from `frontend-v2/`: `yarn lint && yarn test:coverage 2>&1 | tail -15`. Expected: silent lint, all pass, thresholds hold.

Live check against the compose stack (gateway :8080, `yarn dev` :3001, sign in as Root `admin` / `change-me-now`, login field `identifier`): open `/console/metrics` — a degraded row prints `<0.1/s` or a real number, never `DEGRADED · 0 errors/s`; the Latency p99 panel with no data shows its catalogue meta, not "no gRPC traffic". Open `/console/content` — each row's kebab is announced with the row's title (inspect `aria-label`). Report what was seen.

```bash
git add frontend-v2
git commit --no-verify -m "fix(frontend-v2): metrics and content minors from the Part 4 reviews

Frontend-only; the backend gate is skipped with --no-verify because
nothing under backend/ changes.

A degraded row no longer prints '0 errors/s' — a non-zero rate that
rounds to nothing prints '<0.1/s'. The chart's spoken summary uses the
panel's own formatter. servicesOf and focusSeries share one
matchesService. A lone sample between two gaps draws a dash. The
no-budget grid has four columns for its four tiles. StatTile speaks
through hidden text, not an aria-label on a <p>. An empty latency
quantile is not 'no gRPC traffic'. The metrics gateway spec drops a
dead CSRF line and asserts a real gateway message; use-metrics pins
that stale data survives a failed refetch. Each Content row's menu is
named for its row.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrHyq7RySJQ9mQLKCc9sef"
```

---

### Task 5: Final whole-branch review

Review the four commits as one package (`git diff 261e6c2..HEAD -- backend/services/mesh-service frontend-v2`) against the spec. Findings ranked Critical / Important / Minor; Important and above get a fix wave in the same session, Minor is recorded in the ledger. No commit from this task unless a fix wave runs.
