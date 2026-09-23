package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// maxPlacementBatch mirrors the catalog's ceiling so an oversized batch is a
// 400 before any round trip. The catalog still enforces it.
const maxPlacementBatch = 100

// CreatePlacements validates a batch and lands it on territorySlug in one
// catalog transaction. Every item is pinned to territorySlug (the territory the
// route's gate checked) whatever it carried.
func (g *Gateway) CreatePlacements(ctx context.Context, territorySlug string, items []domain.Placement) ([]domain.Placement, error) {
	if len(items) == 0 || len(items) > maxPlacementBatch {
		return nil, fmt.Errorf("%w: a batch holds 1 to %d placements, got %d",
			domain.ErrInvalidInput, maxPlacementBatch, len(items))
	}
	prepared := make([]domain.Placement, len(items))
	for i, p := range items {
		p.TerritorySlug = territorySlug
		ready, err := preparePlacement(p)
		if err != nil {
			return nil, fmt.Errorf("item %d: %w", i, err)
		}
		prepared[i] = ready
	}
	return g.catalog.CreatePlacements(ctx, territorySlug, prepared)
}
