package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListModels returns every model in the catalog.
func (c *Catalog) ListModels(ctx context.Context) ([]domain.Model, error) {
	return c.repo.ListModels(ctx)
}
