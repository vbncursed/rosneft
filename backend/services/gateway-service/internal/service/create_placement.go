package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (g *Gateway) CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	if p.ParentSlug == "" || p.AssetSlug == "" {
		return domain.Placement{}, fmt.Errorf("%w: parent_slug and asset_slug are required", domain.ErrInvalidInput)
	}
	if p.ParentSlug == p.AssetSlug {
		return domain.Placement{}, domain.ErrSelfPlacement
	}
	return g.catalog.CreatePlacement(ctx, p)
}
