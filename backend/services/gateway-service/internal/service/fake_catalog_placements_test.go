package service_test

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// Placement methods of fakeCatalog. Split out to stay under the 200-line
// file cap.

func (c *fakeCatalog) ListPlacements(_ context.Context, slug string) ([]domain.Placement, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.ErrListPlacements != nil {
		return nil, c.ErrListPlacements
	}
	out := make([]domain.Placement, 0, 8)
	for _, p := range c.placements {
		if p.TerritorySlug == slug {
			out = append(out, p)
		}
	}
	return out, nil
}

func (c *fakeCatalog) CreatePlacement(_ context.Context, p domain.Placement) (domain.Placement, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.LastCreatePlacement = p
	if c.ErrCreatePlacement != nil {
		return domain.Placement{}, c.ErrCreatePlacement
	}
	c.nextID++
	p.ID = c.nextID
	c.placements[p.ID] = p
	return p, nil
}

func (c *fakeCatalog) UpdatePlacement(_ context.Context, p domain.Placement) (domain.Placement, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.LastUpdatePlacement = p
	if c.ErrUpdatePlacement != nil {
		return domain.Placement{}, c.ErrUpdatePlacement
	}
	if _, ok := c.placements[p.ID]; !ok {
		return domain.Placement{}, domain.ErrPlacementNotFound
	}
	c.placements[p.ID] = p
	return p, nil
}

func (c *fakeCatalog) SetPlacementVisibility(_ context.Context, territorySlug string, placementID int64, panoramaIDs []int64) (domain.Placement, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	p, ok := c.placements[placementID]
	if !ok || p.TerritorySlug != territorySlug {
		return domain.Placement{}, domain.ErrPlacementNotFound
	}
	p.VisiblePanoramaIDs = panoramaIDs
	c.placements[placementID] = p
	return p, nil
}

func (c *fakeCatalog) DeletePlacement(_ context.Context, id int64) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.placements[id]; !ok {
		return domain.ErrPlacementNotFound
	}
	delete(c.placements, id)
	return nil
}
