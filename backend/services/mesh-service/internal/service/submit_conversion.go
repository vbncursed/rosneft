package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// SubmitConversion validates the request, persists a Pending job, and pushes
// it onto the conversion queue. Kind selects which catalog entity (territory
// or model) the job is targeting; the worker uses Kind to decide which
// catalog table receives the resulting artifacts.
func (m *Mesh) SubmitConversion(ctx context.Context, kind domain.Kind, slug string) (domain.Job, error) {
	if kind == domain.KindUnspecified {
		return domain.Job{}, fmt.Errorf("%w: kind is required", domain.ErrInvalidInput)
	}
	if slug == "" {
		return domain.Job{}, fmt.Errorf("%w: slug is required", domain.ErrInvalidInput)
	}

	job := domain.Job{
		ID:     m.idGen(),
		Kind:   kind,
		Slug:   slug,
		Status: domain.JobStatusPending,
	}
	if err := m.queue.SaveJob(ctx, job); err != nil {
		return domain.Job{}, fmt.Errorf("service.SubmitConversion: save: %w", err)
	}
	if err := m.queue.EnqueueJob(ctx, job.ID); err != nil {
		return domain.Job{}, fmt.Errorf("service.SubmitConversion: enqueue: %w", err)
	}
	return m.queue.GetJob(ctx, job.ID)
}
