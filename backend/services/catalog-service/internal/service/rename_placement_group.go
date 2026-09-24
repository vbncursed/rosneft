package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// RenamePlacementGroup retitles group id on territorySlug. A group of another
// territory is ErrPlacementGroupNotFound, same as an unknown id.
func (c *Catalog) RenamePlacementGroup(ctx context.Context, territorySlug string, id int64, title string) (domain.PlacementGroup, error) {
	if territorySlug == "" || id <= 0 {
		return domain.PlacementGroup{}, fmt.Errorf("service.RenamePlacementGroup: %w: territory slug and id are required", domain.ErrInvalidInput)
	}
	title, err := groupTitle(title)
	if err != nil {
		return domain.PlacementGroup{}, fmt.Errorf("service.RenamePlacementGroup: %w", err)
	}
	return c.repo.RenamePlacementGroup(ctx, territorySlug, id, title)
}
