package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// SetTerritoryRescaleBaseline records the territory's pre-replacement source
// max-dimension so the next conversion can rescale placements to the new
// normalization. sourceMax must be positive — a non-positive baseline would
// yield a meaningless rescale factor.
func (c *Catalog) SetTerritoryRescaleBaseline(ctx context.Context, slug string, sourceMax float64) error {
	if slug == "" {
		return fmt.Errorf("service.SetTerritoryRescaleBaseline: %w: empty slug", domain.ErrInvalidInput)
	}
	if sourceMax <= 0 {
		return fmt.Errorf("service.SetTerritoryRescaleBaseline: %w: source_max must be positive", domain.ErrInvalidInput)
	}
	return c.repo.SetTerritoryRescaleBaseline(ctx, slug, sourceMax)
}
