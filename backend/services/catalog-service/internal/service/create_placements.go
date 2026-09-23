package service

import (
	"context"
	"fmt"
	"maps"
	"slices"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// maxPlacementBatch bounds one batch: the editor lays copies out in a row, and
// a hundred is more than one drop ever places.
const maxPlacementBatch = 100

// CreatePlacements lands 1–100 placements on territorySlug in one transaction.
// Each item is pinned to territorySlug; the panorama allowlists are checked
// against the territory once for the whole batch.
func (c *Catalog) CreatePlacements(ctx context.Context, territorySlug string, items []domain.Placement) ([]domain.Placement, error) {
	if len(items) == 0 || len(items) > maxPlacementBatch {
		return nil, fmt.Errorf("service.CreatePlacements: %w: a batch holds 1 to %d placements, got %d",
			domain.ErrInvalidInput, maxPlacementBatch, len(items))
	}
	prepared := make([]domain.Placement, len(items))
	// A set: copies of one object share their allowlist, so a batch names the
	// same panorama many times and the check needs each id once.
	panoramaIDs := map[int64]struct{}{}
	for i, p := range items {
		p.TerritorySlug = territorySlug
		ready, err := preparePlacement(p)
		if err != nil {
			return nil, fmt.Errorf("service.CreatePlacements: %w", domain.ItemError{Index: i, Err: err})
		}
		prepared[i] = ready
		for _, id := range ready.VisiblePanoramaIDs {
			panoramaIDs[id] = struct{}{}
		}
	}
	if len(panoramaIDs) > 0 {
		ids := slices.Collect(maps.Keys(panoramaIDs))
		if err := c.requirePanoramasOnTerritory(ctx, territorySlug, ids); err != nil {
			return nil, fmt.Errorf("service.CreatePlacements: %w", err)
		}
	}
	return c.repo.CreatePlacements(ctx, prepared)
}
