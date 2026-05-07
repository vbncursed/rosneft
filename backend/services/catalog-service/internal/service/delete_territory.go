package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeleteTerritory removes a territory by slug.
func (c *Catalog) DeleteTerritory(ctx context.Context, slug string) error {
	if slug == "" {
		return fmt.Errorf("service.DeleteTerritory: %w: empty slug", domain.ErrInvalidInput)
	}
	return c.repo.DeleteTerritory(ctx, slug)
}
