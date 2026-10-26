package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListModelTags returns the fixed tag list, as the catalog sorts it.
func (g *Gateway) ListModelTags(ctx context.Context) ([]domain.ModelTag, error) {
	return g.catalog.ListModelTags(ctx)
}
