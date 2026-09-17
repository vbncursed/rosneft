package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeleteMeasurement removes one measurement on territorySlug. A measurement on
// another territory is ErrMeasurementNotFound, same as an unknown id.
func (c *Catalog) DeleteMeasurement(ctx context.Context, territorySlug string, id int64) error {
	if territorySlug == "" {
		return fmt.Errorf("service.DeleteMeasurement: %w: empty territory slug", domain.ErrInvalidInput)
	}
	if id <= 0 {
		return fmt.Errorf("service.DeleteMeasurement: %w: id is required", domain.ErrInvalidInput)
	}
	return c.repo.DeleteMeasurement(ctx, territorySlug, id)
}
