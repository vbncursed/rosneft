package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListTerritories returns every territory in the catalog.
func (c *Catalog) ListTerritories(ctx context.Context) ([]domain.Territory, error) {
	return c.repo.ListTerritories(ctx)
}
