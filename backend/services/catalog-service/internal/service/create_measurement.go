package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreateMeasurement saves a finished chain on m.TerritorySlug. The author is
// taken from the request's actor by storage, never from m.
func (c *Catalog) CreateMeasurement(ctx context.Context, m domain.Measurement) (domain.Measurement, error) {
	if err := validateMeasurement(m); err != nil {
		return domain.Measurement{}, fmt.Errorf("service.CreateMeasurement: %w", err)
	}
	return c.repo.CreateMeasurement(ctx, m)
}
