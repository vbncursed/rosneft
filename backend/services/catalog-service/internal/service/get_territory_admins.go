package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// GetTerritoryAdmins returns the admin user ids assigned to a territory.
func (c *Catalog) GetTerritoryAdmins(ctx context.Context, slug string) ([]string, error) {
	if slug == "" {
		return nil, fmt.Errorf("service.GetTerritoryAdmins: %w: empty slug", domain.ErrInvalidInput)
	}
	return c.repo.GetTerritoryAdmins(ctx, slug)
}
