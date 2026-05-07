package service_test

import (
	"context"
	"slices"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// Model + model-artifact methods of fakeRepo. Split out from fake_repo_test.go
// to stay under the 200-line file cap.

func (r *fakeRepo) UpsertModel(_ context.Context, m domain.Model) (domain.Model, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.LastUpsertModel = m
	r.models[m.Slug] = m
	return m, nil
}

func (r *fakeRepo) GetModel(_ context.Context, slug string) (domain.Model, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	m, ok := r.models[slug]
	if !ok {
		return domain.Model{}, domain.ErrModelNotFound
	}
	return m, nil
}

func (r *fakeRepo) ListModels(_ context.Context) ([]domain.Model, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]domain.Model, 0, len(r.models))
	for _, m := range r.models {
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

func (r *fakeRepo) DeleteModel(_ context.Context, slug string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.models[slug]; !ok {
		return domain.ErrModelNotFound
	}
	delete(r.models, slug)
	return nil
}

func (r *fakeRepo) RegisterModelArtifact(_ context.Context, a domain.Artifact) (domain.Artifact, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.LastRegisterModelArtifact = a
	if r.ErrRegisterModelArtifact != nil {
		return domain.Artifact{}, r.ErrRegisterModelArtifact
	}
	r.modelArts[a.Slug] = append(r.modelArts[a.Slug], a)
	return a, nil
}

func (r *fakeRepo) GetModelArtifact(_ context.Context, slug string, lod uint32) (domain.Artifact, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, a := range r.modelArts[slug] {
		if a.LOD == lod {
			return a, nil
		}
	}
	return domain.Artifact{}, domain.ErrArtifactNotFound
}

func (r *fakeRepo) ListModelArtifacts(_ context.Context, slug string) ([]domain.Artifact, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return slices.Clone(r.modelArts[slug]), nil
}
