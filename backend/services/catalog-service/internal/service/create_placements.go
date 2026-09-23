package service

import (
	"context"
	"fmt"

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
	var panoramaIDs []int64
	for i, p := range items {
		p.TerritorySlug = territorySlug
		ready, err := preparePlacement(p)
		if err != nil {
			return nil, fmt.Errorf("service.CreatePlacements: item %d: %w", i, err)
		}
		prepared[i] = ready
		panoramaIDs = append(panoramaIDs, ready.VisiblePanoramaIDs...)
	}
	if len(panoramaIDs) > 0 {
		if err := c.requirePanoramasOnTerritory(ctx, territorySlug, panoramaIDs); err != nil {
			return nil, fmt.Errorf("service.CreatePlacements: %w", err)
		}
	}
	return c.repo.CreatePlacements(ctx, prepared)
}
