package service

import (
	"context"
	"slices"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// ListTargetJobs is the catalog-wide read behind the console's Content screen:
// one job per target, the latest, whatever its status — except a failed
// backfill (domain.Job.Backfill): the target already has its LOD0 and works, so
// the failure is not the console's to show. It stays in the log (markFailed)
// and in the queue's index, which the reconciler reads unfiltered for its skip
// and convergence rules. A queued or running backfill is listed.
func (m *Mesh) ListTargetJobs(ctx context.Context) ([]domain.Job, error) {
	jobs, err := m.queue.ListTargetJobs(ctx)
	if err != nil {
		return nil, err
	}
	return slices.DeleteFunc(slices.Clone(jobs), func(j domain.Job) bool {
		return j.Backfill && j.Status == domain.JobStatusFailed
	}), nil
}
