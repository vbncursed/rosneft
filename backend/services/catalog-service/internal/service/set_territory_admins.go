package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// SetTerritoryAdmins replaces a territory's assigned-admin set.
func (c *Catalog) SetTerritoryAdmins(ctx context.Context, slug string, adminIDs []string) error {
	if slug == "" {
		return fmt.Errorf("service.SetTerritoryAdmins: %w: empty slug", domain.ErrInvalidInput)
	}
	return c.repo.SetTerritoryAdmins(ctx, slug, adminIDs)
}
