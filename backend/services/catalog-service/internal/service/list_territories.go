package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListTerritories returns territories visible to scopeAdminID (empty = all).
func (c *Catalog) ListTerritories(ctx context.Context, scopeAdminID string) ([]domain.Territory, error) {
	return c.repo.ListTerritories(ctx, scopeAdminID)
}
