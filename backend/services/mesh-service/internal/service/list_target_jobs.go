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
