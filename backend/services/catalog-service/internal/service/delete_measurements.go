package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeleteMeasurements removes every measurement on territorySlug and returns
// how many there were.
func (c *Catalog) DeleteMeasurements(ctx context.Context, territorySlug string) (int, error) {
	if territorySlug == "" {
		return 0, fmt.Errorf("service.DeleteMeasurements: %w: empty territory slug", domain.ErrInvalidInput)
	}
	return c.repo.DeleteMeasurements(ctx, territorySlug)
}
