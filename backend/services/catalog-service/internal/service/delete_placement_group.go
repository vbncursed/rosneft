package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeletePlacementGroup removes group id on territorySlug; its placements return
// to no group. A group of another territory is ErrPlacementGroupNotFound.
func (c *Catalog) DeletePlacementGroup(ctx context.Context, territorySlug string, id int64) error {
	if territorySlug == "" || id <= 0 {
		return fmt.Errorf("service.DeletePlacementGroup: %w: territory slug and id are required", domain.ErrInvalidInput)
	}
	return c.repo.DeletePlacementGroup(ctx, territorySlug, id)
}
