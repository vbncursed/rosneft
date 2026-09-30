package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// SetPlacementGroupHidden hides or shows group id on territorySlug for every
// reader. Its placements keep their own flag: a member is drawn only when
// neither it nor its group is hidden. A group of another territory is
// ErrPlacementGroupNotFound, same as an unknown id.
func (c *Catalog) SetPlacementGroupHidden(ctx context.Context, territorySlug string, id int64, hidden bool) (domain.PlacementGroup, error) {
	if territorySlug == "" || id <= 0 {
		return domain.PlacementGroup{}, fmt.Errorf("service.SetPlacementGroupHidden: %w: territory slug and id are required", domain.ErrInvalidInput)
	}
	return c.repo.SetPlacementGroupHidden(ctx, territorySlug, id, hidden)
}
