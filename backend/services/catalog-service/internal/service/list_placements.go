package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListPlacements returns every placement attached to the parent project.
func (c *Catalog) ListPlacements(ctx context.Context, parentSlug string) ([]domain.Placement, error) {
	if parentSlug == "" {
		return nil, fmt.Errorf("service.ListPlacements: %w: empty parent slug", domain.ErrInvalidInput)
	}
	return c.repo.ListPlacements(ctx, parentSlug)
}
