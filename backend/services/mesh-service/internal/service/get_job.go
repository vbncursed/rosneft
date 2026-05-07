package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// GetJob fetches a job by its ID.
func (m *Mesh) GetJob(ctx context.Context, id string) (domain.Job, error) {
	if id == "" {
		return domain.Job{}, fmt.Errorf("%w: id is required", domain.ErrInvalidInput)
	}
	return m.queue.GetJob(ctx, id)
}
