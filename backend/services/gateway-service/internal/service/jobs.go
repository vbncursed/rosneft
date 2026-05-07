package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// GetJob fetches a conversion job by id (used by the SSE handler).
func (g *Gateway) GetJob(ctx context.Context, id string) (domain.Job, error) {
	if id == "" {
		return domain.Job{}, fmt.Errorf("%w: id is required", domain.ErrInvalidInput)
	}
	return g.mesh.GetJob(ctx, id)
}
