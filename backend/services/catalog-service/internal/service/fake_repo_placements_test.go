package service_test

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// Placement methods of fakeRepo. Split out from fake_repo_test.go to stay
// under the 200-line file cap.

func (r *fakeRepo) ListPlacements(_ context.Context, territorySlug string) ([]domain.Placement, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]domain.Placement, 0, 8)
	for _, p := range r.placements {
		if p.TerritorySlug == territorySlug {
			out = append(out, p)
		}
	}
	return out, nil
}

func (r *fakeRepo) CreatePlacement(_ context.Context, p domain.Placement) (domain.Placement, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.LastCreatePlacement = p
	if r.ErrCreatePlacement != nil {
		return domain.Placement{}, r.ErrCreatePlacement
	}
	r.nextID++
	p.ID = r.nextID
	r.placements[p.ID] = p
	return p, nil
}

func (r *fakeRepo) UpdatePlacement(_ context.Context, p domain.Placement) (domain.Placement, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.LastUpdatePlacement = p
	if r.ErrUpdatePlacement != nil {
		return domain.Placement{}, r.ErrUpdatePlacement
	}
	if _, ok := r.placements[p.ID]; !ok {
		return domain.Placement{}, domain.ErrPlacementNotFound
	}
	r.placements[p.ID] = p
	return p, nil
}

func (r *fakeRepo) SetPlacementVisibility(_ context.Context, territorySlug string, placementID int64, panoramaIDs []int64) (domain.Placement, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	p, ok := r.placements[placementID]
	if !ok || p.TerritorySlug != territorySlug {
		return domain.Placement{}, domain.ErrPlacementNotFound
	}
	p.VisiblePanoramaIDs = panoramaIDs
	r.placements[placementID] = p
	return p, nil
}

func (r *fakeRepo) SetPlacementPanoramaLabel(_ context.Context, territorySlug string, placementID, panoramaID int64, label string) (domain.Placement, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	p, ok := r.placements[placementID]
	if !ok || p.TerritorySlug != territorySlug {
		return domain.Placement{}, domain.ErrPlacementNotFound
	}
	out := make([]domain.PanoramaLabel, 0, len(p.PanoramaLabels)+1)
	for _, l := range p.PanoramaLabels {
		if l.PanoramaID != panoramaID {
			out = append(out, l)
		}
	}
	if label != "" {
		out = append(out, domain.PanoramaLabel{PanoramaID: panoramaID, Label: label})
	}
	p.PanoramaLabels = out
	r.placements[placementID] = p
	return p, nil
}

func (r *fakeRepo) DeletePlacement(_ context.Context, id int64) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.placements[id]; !ok {
		return domain.ErrPlacementNotFound
	}
	delete(r.placements, id)
	return nil
}
