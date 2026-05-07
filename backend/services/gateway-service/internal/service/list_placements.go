package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (g *Gateway) ListPlacements(ctx context.Context, parentSlug string) ([]domain.Placement, error) {
	if parentSlug == "" {
		return nil, fmt.Errorf("%w: slug is required", domain.ErrInvalidInput)
	}
	return g.catalog.ListPlacements(ctx, parentSlug)
}
