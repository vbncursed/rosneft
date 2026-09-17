package service

import (
	"context"
	"fmt"
	"slices"

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

	if err := c.requirePanoramasOnTerritory(ctx, territorySlug, panoramaIDs); err != nil {
		return domain.Placement{}, fmt.Errorf("service.SetPlacementVisibility: %w", err)
	}
	return c.repo.SetPlacementVisibility(ctx, territorySlug, placementID, panoramaIDs)
}

// requirePanoramasOnTerritory fails with ErrInvalidInput unless every id is a
// panorama anchored to territorySlug. Panorama ids are global BIGSERIALs, so
// without this an allowlist could name another tenant's panorama. An unknown
// territory surfaces as ErrTerritoryNotFound.
func (c *Catalog) requirePanoramasOnTerritory(ctx context.Context, territorySlug string, panoramaIDs []int64) error {
	onTerritory, err := c.repo.ListPanoramaIDs(ctx, territorySlug)
	if err != nil {
		return err
	}
	for _, id := range panoramaIDs {
		if !slices.Contains(onTerritory, id) {
			return fmt.Errorf("%w: panorama %d is not on territory %q", domain.ErrInvalidInput, id, territorySlug)
		}
	}
	return nil
}
