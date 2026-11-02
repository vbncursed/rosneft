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
// against the territory once for the whole batch. A non-empty key makes the
// batch idempotent on the territory: a batch already stored under it is
// answered before the panorama check.
func (c *Catalog) CreatePlacements(
	ctx context.Context,
	territorySlug, key string,
	items []domain.Placement,
) ([]domain.Placement, error) {
	prepared, panoramaIDs, err := prepareBatch(territorySlug, items)
	if err != nil {
		return nil, err
	}
	// A replay answers the batch as stored, before anything is checked against
	// the territory as it is now — a panorama deleted since must not turn the
	// retry of a batch that landed into a refusal. Storage reads again inside
	// the writing transaction, which is what settles a race.
	if key != "" {
		stored, err := c.repo.PlacementBatch(ctx, territorySlug, key, len(prepared))
		if err != nil || stored != nil {
			return stored, err
		}
	}
	if len(panoramaIDs) > 0 {
		if err := c.requirePanoramasOnTerritory(ctx, territorySlug, panoramaIDs); err != nil {
			return nil, fmt.Errorf("service.CreatePlacements: %w", err)
		}
	}
	return c.repo.CreatePlacements(ctx, key, prepared)
}

// prepareBatch checks the batch size, pins every item to territorySlug and
// validates it, and returns the items with the distinct panorama ids their
// allowlists name. The first bad item wins, reported by its position.
func prepareBatch(territorySlug string, items []domain.Placement) ([]domain.Placement, []int64, error) {
	if len(items) == 0 || len(items) > maxPlacementBatch {
		return nil, nil, fmt.Errorf("service.CreatePlacements: %w: a batch holds 1 to %d placements, got %d",
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
			return nil, nil, fmt.Errorf("service.CreatePlacements: %w", domain.ItemError{Index: i, Err: err})
		}
		prepared[i] = ready
		for _, id := range ready.VisiblePanoramaIDs {
			panoramaIDs[id] = struct{}{}
		}
	}
	return prepared, slices.Collect(maps.Keys(panoramaIDs)), nil
}
