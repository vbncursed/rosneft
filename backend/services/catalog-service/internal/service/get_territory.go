package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// GetTerritory returns a single territory by slug, scoped to scopeAdminID when
// non-empty (empty = no scope check).
func (c *Catalog) GetTerritory(ctx context.Context, slug, scopeAdminID string) (domain.Territory, error) {
	if slug == "" {
		return domain.Territory{}, fmt.Errorf("service.GetTerritory: %w: empty slug", domain.ErrInvalidInput)
	}
	return c.repo.GetTerritory(ctx, slug, scopeAdminID)
}
