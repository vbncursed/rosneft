package service_test

import (
	"context"
	"slices"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// Model + model-artifact methods of fakeCatalog. Split out to stay under the
// 200-line file cap.

func (c *fakeCatalog) ListModels(_ context.Context) ([]domain.Model, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.ErrListModels != nil {
		return nil, c.ErrListModels
	}
	out := make([]domain.Model, 0, len(c.models))
	for _, m := range c.models {
		out = append(out, m)
	}
	slices.SortFunc(out, func(a, b domain.Model) int {
		switch {
		case a.Slug < b.Slug:
			return -1
		case a.Slug > b.Slug:
			return 1
		}
		return 0
	})
	return out, nil
}

func (c *fakeCatalog) GetModel(_ context.Context, slug string) (domain.Model, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	m, ok := c.models[slug]
	if !ok {
		return domain.Model{}, domain.ErrModelNotFound
	}
	return m, nil
}

func (c *fakeCatalog) UpsertModel(_ context.Context, m domain.Model) (domain.Model, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.LastUpsertModel = m
	if c.ErrUpsertModel != nil {
		return domain.Model{}, c.ErrUpsertModel
	}
	c.models[m.Slug] = m
	return m, nil
}

func (c *fakeCatalog) DeleteModel(_ context.Context, slug string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.models[slug]; !ok {
		return domain.ErrModelNotFound
	}
	delete(c.models, slug)
	return nil
}

func (c *fakeCatalog) ListModelArtifacts(_ context.Context, slug string) ([]domain.Artifact, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return slices.Clone(c.modelArts[slug]), nil
}

func (c *fakeCatalog) GetModelArtifact(_ context.Context, slug string, lod uint32) (domain.Artifact, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, a := range c.modelArts[slug] {
		if a.LOD == lod {
			return a, nil
		}
	}
	return domain.Artifact{}, domain.ErrArtifactNotFound
}
