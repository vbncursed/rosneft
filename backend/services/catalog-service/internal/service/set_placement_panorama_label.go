package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// SetPlacementPanoramaLabel sets (or clears, when label is empty) a
// placement's name within one panorama. The panorama must belong to the
// territory. Returns the updated placement.
func (c *Catalog) SetPlacementPanoramaLabel(ctx context.Context, territorySlug string, placementID, panoramaID int64, label string) (domain.Placement, error) {
	if territorySlug == "" {
		return domain.Placement{}, fmt.Errorf("service.SetPlacementPanoramaLabel: %w: empty territory slug", domain.ErrInvalidInput)
	}
	if placementID <= 0 || panoramaID <= 0 {
		return domain.Placement{}, fmt.Errorf("service.SetPlacementPanoramaLabel: %w: placement id and panorama id are required", domain.ErrInvalidInput)
	}

	panoramas, err := c.repo.ListPanoramas(ctx, territorySlug)
	if err != nil {
		return domain.Placement{}, err
	}
	onTerritory := false
	for _, p := range panoramas {
		if p.ID == panoramaID {
			onTerritory = true
			break
		}
	}
	if !onTerritory {
		return domain.Placement{}, fmt.Errorf("service.SetPlacementPanoramaLabel: %w: panorama %d is not on territory %q", domain.ErrInvalidInput, panoramaID, territorySlug)
	}

	return c.repo.SetPlacementPanoramaLabel(ctx, territorySlug, placementID, panoramaID, label)
}
