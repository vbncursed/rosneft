package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListPlacementGroups returns every group on a territory.
func (c *Catalog) ListPlacementGroups(ctx context.Context, territorySlug string) ([]domain.PlacementGroup, error) {
	if territorySlug == "" {
		return nil, fmt.Errorf("service.ListPlacementGroups: %w: empty territory slug", domain.ErrInvalidInput)
	}
	return c.repo.ListPlacementGroups(ctx, territorySlug)
}
