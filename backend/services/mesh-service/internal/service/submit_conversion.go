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
