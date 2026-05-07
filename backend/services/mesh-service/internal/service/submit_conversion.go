package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// SubmitConversion validates the request, persists a Pending job, and pushes
// it onto the conversion queue. Returns the persisted job for the caller to
// poll via GetJob.
func (m *Mesh) SubmitConversion(ctx context.Context, projectSlug string) (domain.Job, error) {
	if projectSlug == "" {
		return domain.Job{}, fmt.Errorf("%w: project_slug is required", domain.ErrInvalidInput)
	}

	job := domain.Job{
		ID:          m.idGen(),
		ProjectSlug: projectSlug,
		Status:      domain.JobStatusPending,
	}
	if err := m.queue.SaveJob(ctx, job); err != nil {
		return domain.Job{}, fmt.Errorf("service.SubmitConversion: save: %w", err)
	}
	if err := m.queue.EnqueueJob(ctx, job.ID); err != nil {
		return domain.Job{}, fmt.Errorf("service.SubmitConversion: enqueue: %w", err)
	}
	return m.queue.GetJob(ctx, job.ID)
}
