package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (g *Gateway) UpdatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	if p.ID <= 0 {
		return domain.Placement{}, fmt.Errorf("%w: id is required", domain.ErrInvalidInput)
	}
	return g.catalog.UpdatePlacement(ctx, p)
}
