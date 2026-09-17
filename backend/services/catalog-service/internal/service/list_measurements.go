package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListMeasurements returns every saved measurement on a territory.
func (c *Catalog) ListMeasurements(ctx context.Context, territorySlug string) ([]domain.Measurement, error) {
	if territorySlug == "" {
		return nil, fmt.Errorf("service.ListMeasurements: %w: empty territory slug", domain.ErrInvalidInput)
	}
	return c.repo.ListMeasurements(ctx, territorySlug)
}
