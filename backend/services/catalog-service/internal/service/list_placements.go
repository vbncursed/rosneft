package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListPlacements returns every placement attached to a territory.
func (c *Catalog) ListPlacements(ctx context.Context, territorySlug string) ([]domain.Placement, error) {
	if territorySlug == "" {
		return nil, fmt.Errorf("service.ListPlacements: %w: empty territory slug", domain.ErrInvalidInput)
	}
	return c.repo.ListPlacements(ctx, territorySlug)
}
