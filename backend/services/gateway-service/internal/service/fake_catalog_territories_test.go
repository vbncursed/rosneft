package service_test

import (
	"context"
	"slices"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// Territory + territory-artifact methods of fakeCatalog. Split out to stay
// under the 200-line file cap.

func (c *fakeCatalog) ListTerritories(_ context.Context) ([]domain.Territory, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]domain.Territory, 0, len(c.territories))
	for _, t := range c.territories {
		out = append(out, t)
	}
	return out, nil
}

func (c *fakeCatalog) GetTerritory(_ context.Context, slug string) (domain.Territory, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	t, ok := c.territories[slug]
	if !ok {
		return domain.Territory{}, domain.ErrTerritoryNotFound
	}
	return t, nil
}

func (c *fakeCatalog) UpsertTerritory(_ context.Context, t domain.Territory) (domain.Territory, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.LastUpsertTerritory = t
	if c.ErrUpsertTerritory != nil {
		return domain.Territory{}, c.ErrUpsertTerritory
	}
	c.territories[t.Slug] = t
	return t, nil
}

func (c *fakeCatalog) DeleteTerritory(_ context.Context, slug string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.territories[slug]; !ok {
		return domain.ErrTerritoryNotFound
	}
	delete(c.territories, slug)
	return nil
}

func (c *fakeCatalog) ListTerritoryArtifacts(_ context.Context, slug string) ([]domain.Artifact, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.ErrListTerrArts != nil {
		return nil, c.ErrListTerrArts
	}
	return slices.Clone(c.terrArts[slug]), nil
}

func (c *fakeCatalog) DeleteTerritoryArtifacts(_ context.Context, slug string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.LastDeleteTerritoryArtifacts = slug
	if c.ErrDeleteTerritoryArtifacts != nil {
		return c.ErrDeleteTerritoryArtifacts
	}
	delete(c.terrArts, slug)
	return nil
}

func (c *fakeCatalog) GetTerritoryArtifact(_ context.Context, slug string, lod uint32) (domain.Artifact, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, a := range c.terrArts[slug] {
		if a.LOD == lod {
			return a, nil
		}
	}
	return domain.Artifact{}, domain.ErrArtifactNotFound
}
