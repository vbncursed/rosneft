package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreatePlacementGroup adds a group to territorySlug under the trimmed title.
func (c *Catalog) CreatePlacementGroup(ctx context.Context, territorySlug, title string) (domain.PlacementGroup, error) {
	if territorySlug == "" {
		return domain.PlacementGroup{}, fmt.Errorf("service.CreatePlacementGroup: %w: empty territory slug", domain.ErrInvalidInput)
	}
	title, err := groupTitle(title)
	if err != nil {
		return domain.PlacementGroup{}, fmt.Errorf("service.CreatePlacementGroup: %w", err)
	}
	return c.repo.CreatePlacementGroup(ctx, territorySlug, title)
}
