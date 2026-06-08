package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListPanoramas returns the panoramas attached to a territory.
func (c *Catalog) ListPanoramas(ctx context.Context, territorySlug string) ([]domain.Panorama, error) {
	if territorySlug == "" {
		return nil, fmt.Errorf("service.ListPanoramas: %w: territory_slug is required", domain.ErrInvalidInput)
	}
	return c.repo.ListPanoramas(ctx, territorySlug)
}
