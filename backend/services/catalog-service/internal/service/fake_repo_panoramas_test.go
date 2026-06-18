package service_test

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// Panorama methods of fakeRepo. Split out to stay under the 200-line cap.

func (r *fakeRepo) ListPanoramas(_ context.Context, territorySlug string) ([]domain.Panorama, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.territories[territorySlug]; !ok {
		return nil, domain.ErrTerritoryNotFound
	}
	out := make([]domain.Panorama, 0, 4)
	for _, p := range r.panoramas {
		if p.TerritorySlug == territorySlug {
			out = append(out, p)
		}
	}
	return out, nil
}

func (r *fakeRepo) CreatePanorama(_ context.Context, p domain.Panorama) (domain.Panorama, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.LastCreatePanorama = p
	if r.ErrCreatePanorama != nil {
		return domain.Panorama{}, r.ErrCreatePanorama
	}
	if _, ok := r.territories[p.TerritorySlug]; !ok {
		return domain.Panorama{}, domain.ErrTerritoryNotFound
	}
	for _, ex := range r.panoramas {
		if ex.TerritorySlug == p.TerritorySlug && ex.Slug == p.Slug {
			return domain.Panorama{}, domain.ErrSlugConflict
		}
	}
	r.nextID++
	p.ID = r.nextID
	r.panoramas[p.ID] = p
	return p, nil
}

func (r *fakeRepo) UpdatePanorama(_ context.Context, p domain.Panorama) (domain.Panorama, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.LastUpdatePanorama = p
	if r.ErrUpdatePanorama != nil {
		return domain.Panorama{}, r.ErrUpdatePanorama
	}
	existing, ok := r.panoramas[p.ID]
	if !ok {
		return domain.Panorama{}, domain.ErrPanoramaNotFound
	}
	existing.Title = p.Title
	existing.Position = p.Position
	existing.YawOffset = p.YawOffset
	r.panoramas[p.ID] = existing
	return existing, nil
}

func (r *fakeRepo) DeletePanorama(_ context.Context, id int64) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.panoramas[id]; !ok {
		return domain.ErrPanoramaNotFound
	}
	delete(r.panoramas, id)
	return nil
}
