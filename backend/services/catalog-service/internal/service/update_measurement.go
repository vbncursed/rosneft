package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpdateMeasurement replaces a saved chain's points and closed flag. The
// lookup is scoped to m.TerritorySlug; a measurement on another territory is
// ErrMeasurementNotFound, same as an unknown id.
func (c *Catalog) UpdateMeasurement(ctx context.Context, m domain.Measurement) (domain.Measurement, error) {
	if m.ID <= 0 {
		return domain.Measurement{}, fmt.Errorf("service.UpdateMeasurement: %w: id is required", domain.ErrInvalidInput)
	}
	if err := validateMeasurement(m); err != nil {
		return domain.Measurement{}, fmt.Errorf("service.UpdateMeasurement: %w", err)
	}
	return c.repo.UpdateMeasurement(ctx, m)
}
