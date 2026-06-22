package service_test

import (
	"context"
	"math"
	"slices"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// Territory + territory-artifact methods of fakeRepo. Split out from
// fake_repo_test.go to stay under the 200-line file cap.

func (r *fakeRepo) UpsertTerritory(_ context.Context, t domain.Territory) (domain.Territory, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.LastUpsertTerritory = t
	if r.ErrUpsertTerritory != nil {
		return domain.Territory{}, r.ErrUpsertTerritory
	}
	r.territories[t.Slug] = t
	return t, nil
}

func (r *fakeRepo) CreateTerritory(_ context.Context, t domain.Territory) (domain.Territory, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.LastCreateTerritory = t
	if r.ErrCreateTerritory != nil {
		return domain.Territory{}, r.ErrCreateTerritory
	}
	if _, ok := r.territories[t.Slug]; ok {
		return domain.Territory{}, domain.ErrSlugConflict
	}
	r.territories[t.Slug] = t
	return t, nil
}

func (r *fakeRepo) GetTerritory(_ context.Context, slug string) (domain.Territory, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	t, ok := r.territories[slug]
	if !ok {
		return domain.Territory{}, domain.ErrTerritoryNotFound
	}
	return t, nil
}

func (r *fakeRepo) ListTerritories(_ context.Context) ([]domain.Territory, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]domain.Territory, 0, len(r.territories))
	for _, t := range r.territories {
		out = append(out, t)
	}
	slices.SortFunc(out, func(a, b domain.Territory) int {
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

func (r *fakeRepo) DeleteTerritory(_ context.Context, slug string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.territories[slug]; !ok {
		return domain.ErrTerritoryNotFound
	}
	delete(r.territories, slug)
	return nil
}

func (r *fakeRepo) RegisterTerritoryArtifact(_ context.Context, a domain.Artifact) (domain.Artifact, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.LastRegisterTerritoryArtifact = a
	if r.ErrRegisterTerritoryArtifact != nil {
		return domain.Artifact{}, r.ErrRegisterTerritoryArtifact
	}
	r.terrArts[a.Slug] = append(r.terrArts[a.Slug], a)
	return a, nil
}

func (r *fakeRepo) GetTerritoryArtifact(_ context.Context, slug string, lod uint32) (domain.Artifact, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, a := range r.terrArts[slug] {
		if a.LOD == lod {
			return a, nil
		}
	}
	return domain.Artifact{}, domain.ErrArtifactNotFound
}

func (r *fakeRepo) ListTerritoryArtifacts(_ context.Context, slug string) ([]domain.Artifact, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return slices.Clone(r.terrArts[slug]), nil
}

func (r *fakeRepo) DeleteTerritoryArtifacts(_ context.Context, slug string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.ErrDeleteTerritoryArtifacts != nil {
		return r.ErrDeleteTerritoryArtifacts
	}
	delete(r.terrArts, slug)
	return nil
}

func (r *fakeRepo) SetTerritoryRescaleBaseline(_ context.Context, slug string, sourceMax float64) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.LastSetRescaleBaselineSlug = slug
	r.LastSetRescaleBaselineMax = sourceMax
	if r.ErrSetRescaleBaseline != nil {
		return r.ErrSetRescaleBaseline
	}
	if _, pending := r.rescaleBaseline[slug]; !pending {
		r.rescaleBaseline[slug] = sourceMax // write-once, mirrors the SQL guard
	}
	return nil
}

// RescaleTerritoryPlacements mirrors the storage CTE: scale position+scale of
// every placement on the territory by old_max/newMax, then clear the baseline.
func (r *fakeRepo) RescaleTerritoryPlacements(_ context.Context, slug string, newMax float64) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.LastRescaleSlug = slug
	r.LastRescaleNewMax = newMax
	if r.ErrRescalePlacements != nil {
		return 0, r.ErrRescalePlacements
	}
	old, pending := r.rescaleBaseline[slug]
	if !pending || newMax <= 0 {
		return 0, nil
	}
	delete(r.rescaleBaseline, slug)
	factor := old / newMax
	if math.Abs(factor-1) < 1e-9 {
		return 0, nil
	}
	updated := 0
	for id, p := range r.placements {
		if p.TerritorySlug != slug {
			continue
		}
		p.Position = scaleVec3(p.Position, factor)
		p.Scale = scaleVec3(p.Scale, factor)
		r.placements[id] = p
		updated++
	}
	return updated, nil
}

func scaleVec3(v domain.Vec3, f float64) domain.Vec3 {
	return domain.Vec3{X: v.X * f, Y: v.Y * f, Z: v.Z * f}
}
