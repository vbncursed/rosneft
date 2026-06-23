package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// SetPlacementVisibility replaces the placement's panorama allowlist. Every id
// must reference a panorama on the same territory; an unknown id is rejected
// as invalid input rather than silently stored. Returns the updated placement.
func (c *Catalog) SetPlacementVisibility(ctx context.Context, territorySlug string, placementID int64, panoramaIDs []int64) (domain.Placement, error) {
	if territorySlug == "" {
		return domain.Placement{}, fmt.Errorf("service.SetPlacementVisibility: %w: empty territory slug", domain.ErrInvalidInput)
	}
	if placementID <= 0 {
		return domain.Placement{}, fmt.Errorf("service.SetPlacementVisibility: %w: placement id is required", domain.ErrInvalidInput)
	}

	panoramas, err := c.repo.ListPanoramas(ctx, territorySlug)
	if err != nil {
		return domain.Placement{}, err
	}
	valid := make(map[int64]struct{}, len(panoramas))
	for _, p := range panoramas {
		valid[p.ID] = struct{}{}
	}
	for _, id := range panoramaIDs {
		if _, ok := valid[id]; !ok {
			return domain.Placement{}, fmt.Errorf("service.SetPlacementVisibility: %w: panorama %d is not on territory %q", domain.ErrInvalidInput, id, territorySlug)
		}
	}

	return c.repo.SetPlacementVisibility(ctx, territorySlug, placementID, panoramaIDs)
}
