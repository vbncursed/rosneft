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
//
// The claim no longer has to outlive the queue: markRunning re-takes it as
// the job starts. A queued (Pending, younger than MaxQueueWait) job is
// therefore returned whether or not the claim was free; a Running job is
// returned only while the claim is held, since a lapsed claim on one means
// its worker is gone.
//
// The serialisation is not total: between one submitter's successful
// TryLockTarget and its SaveJob, a concurrent submitter sees the lock held
// and an empty index, treats it as stale and may queue a second job. The
// window is one Redis round trip, versus the whole conversion before.
func (m *Mesh) SubmitConversion(ctx context.Context, kind domain.Kind, slug string) (domain.Job, bool, error) {
	return m.submit(ctx, kind, slug, false)
}

// submit is SubmitConversion; backfill marks the job it creates as the
// reconciler's plain-copy backfill (domain.Job.Backfill). A user-triggered
// submit that lands on a live backfill adopts it by clearing the mark: the
// user is handed that job to follow, so its failure is theirs to see. Queued,
// it converts the replacement; running, it fails or succeeds on the old bytes
// (success re-queues the replacement, requeueIfSourceReplaced), and a retry
// after its failure stays unmarked (ReconcileMissingArtifacts).
func (m *Mesh) submit(ctx context.Context, kind domain.Kind, slug string, backfill bool) (domain.Job, bool, error) {
	if err := validateSubmit(kind, slug); err != nil {
		return domain.Job{}, false, err
	}

	locked, err := m.queue.TryLockTarget(ctx, kind, slug, TargetLockTTL)
	if err != nil {
		return domain.Job{}, false, fmt.Errorf("service.SubmitConversion: lock: %w", err)
	}
	live, err := m.liveJob(ctx, kind, slug)
	if err != nil {
		m.releaseClaim(ctx, kind, slug, locked)
		return domain.Job{}, false, err
	}
	// A held claim means the live job is being looked after. A free one still
	// leaves a queued job queued (the claim is re-taken when it starts), but a
	// Running job without a claim outlived TargetLockTTL: its worker is gone.
	if live != nil && (!locked || m.queued(*live)) {
		job, err := m.followLive(ctx, *live, backfill)
		return job, false, err
	}
	return m.queueNew(ctx, kind, slug, backfill, locked)
}

// validateSubmit is the request check: both a kind and a slug are required.
func validateSubmit(kind domain.Kind, slug string) error {
	if kind == domain.KindUnspecified {
		return fmt.Errorf("%w: kind is required", domain.ErrInvalidInput)
	}
	if slug == "" {
		return fmt.Errorf("%w: slug is required", domain.ErrInvalidInput)
	}
	return nil
}

// followLive is the job handed back to a submit that found one in flight. A
// user's submit adopts a live backfill by clearing its mark.
func (m *Mesh) followLive(ctx context.Context, live domain.Job, backfill bool) (domain.Job, error) {
	if !backfill && live.Backfill {
		if err := m.queue.ClearBackfill(ctx, live.ID); err != nil {
			return domain.Job{}, fmt.Errorf("service.SubmitConversion: adopt: %w", err)
		}
		live.Backfill = false
	}
	return live, nil
}

// queueNew persists a fresh Pending job and pushes it onto the queue; locked
// says whether this call took the claim.
func (m *Mesh) queueNew(
	ctx context.Context, kind domain.Kind, slug string, backfill, locked bool,
) (domain.Job, bool, error) {
	job := domain.Job{
		ID:       m.idGen(),
		Kind:     kind,
		Slug:     slug,
		Status:   domain.JobStatusPending,
		Backfill: backfill,
	}
	if err := m.queue.SaveJob(ctx, job); err != nil {
		m.releaseClaim(ctx, kind, slug, locked)
		return domain.Job{}, false, fmt.Errorf("service.SubmitConversion: save: %w", err)
	}
	if err := m.queue.EnqueueJob(ctx, job.ID); err != nil {
		m.releaseClaim(ctx, kind, slug, locked)
		return domain.Job{}, false, fmt.Errorf("service.SubmitConversion: enqueue: %w", err)
	}
	saved, err := m.queue.GetJob(ctx, job.ID)
	if err != nil {
		return domain.Job{}, false, fmt.Errorf("service.SubmitConversion: get: %w", err)
	}
	return saved, true, nil
}

// releaseClaim gives the target claim back, but only one this call actually
// took. Falling through a stale lock means someone else holds the key: inside
// the TOCTOU window SubmitConversion documents that someone is a live submitter, and unlocking here
// would leave their job running unprotected.
func (m *Mesh) releaseClaim(ctx context.Context, kind domain.Kind, slug string, locked bool) {
	if locked {
		_ = m.queue.UnlockTarget(ctx, kind, slug)
	}
}

// liveJob is the target's latest job if it is still pending or running, else
// nil. Read through the whole index: one index read per in-flight target per
// reconcile tick, and the index is catalog-sized.
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
		return nil, nil //nolint:nilnil // nil job means no live job for the target; the caller then enqueues
	}
	return nil, nil //nolint:nilnil // nil job means no live job for the target; the caller then enqueues
}

// queued reports whether j is waiting in the stream, not abandoned: Pending,
// and younger than MaxQueueWait.
func (m *Mesh) queued(j domain.Job) bool {
	return j.Status == domain.JobStatusPending && m.now().Sub(j.CreatedAt) < MaxQueueWait
}
