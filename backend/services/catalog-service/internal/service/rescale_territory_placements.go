package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// RescaleTerritoryPlacements applies any pending rescale baseline for the
// territory, scaling existing placements to the freshly converted mesh's
// normalization and clearing the baseline. It is a no-op (0 placements) when
// none is pending. Returns the number of placements changed.
func (c *Catalog) RescaleTerritoryPlacements(ctx context.Context, slug string, newMax float64) (int, error) {
	if slug == "" {
		return 0, fmt.Errorf("service.RescaleTerritoryPlacements: %w: empty slug", domain.ErrInvalidInput)
	}
	if newMax <= 0 {
		return 0, fmt.Errorf("service.RescaleTerritoryPlacements: %w: new_source_max must be positive", domain.ErrInvalidInput)
	}
	return c.repo.RescaleTerritoryPlacements(ctx, slug, newMax)
}
