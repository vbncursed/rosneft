package service_test

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// Panorama methods of fakeCatalog. Split out to stay under the 200-line cap.

func (c *fakeCatalog) ListPanoramas(_ context.Context, slug string) ([]domain.Panorama, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.ErrListPanoramas != nil {
		return nil, c.ErrListPanoramas
	}
	out := make([]domain.Panorama, 0, 4)
	for _, p := range c.panoramas {
		if p.TerritorySlug == slug {
			out = append(out, p)
		}
	}
	return out, nil
}

func (c *fakeCatalog) CreatePanorama(_ context.Context, p domain.Panorama) (domain.Panorama, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.LastCreatePanorama = p
	if c.ErrCreatePanorama != nil {
		return domain.Panorama{}, c.ErrCreatePanorama
	}
	c.nextID++
	p.ID = c.nextID
	c.panoramas[p.ID] = p
	return p, nil
}

func (c *fakeCatalog) UpdatePanorama(_ context.Context, p domain.Panorama) (domain.Panorama, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.LastUpdatePanorama = p
	if c.ErrUpdatePanorama != nil {
		return domain.Panorama{}, c.ErrUpdatePanorama
	}
	existing, ok := c.panoramas[p.ID]
	if !ok {
		return domain.Panorama{}, domain.ErrPanoramaNotFound
	}
	existing.Title = p.Title
	existing.Position = p.Position
	existing.YawOffset = p.YawOffset
	c.panoramas[p.ID] = existing
	return existing, nil
}

func (c *fakeCatalog) DeletePanorama(_ context.Context, id int64) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.panoramas[id]; !ok {
		return domain.ErrPanoramaNotFound
	}
	delete(c.panoramas, id)
	return nil
}
