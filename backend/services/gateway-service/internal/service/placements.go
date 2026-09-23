package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListPlacements returns the placements on a territory.
func (g *Gateway) ListPlacements(ctx context.Context, territorySlug string) ([]domain.Placement, error) {
	if territorySlug == "" {
		return nil, fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	}
	return g.catalog.ListPlacements(ctx, territorySlug)
}

// CreatePlacement validates input, fills in defaults (scale {1,1,1}), and
// persists.
func (g *Gateway) CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	ready, err := preparePlacement(p)
	if err != nil {
		return domain.Placement{}, err
	}
	return g.catalog.CreatePlacement(ctx, ready)
}

// preparePlacement checks a new placement and fills the default scale: the
// checks a single create and every batch item share.
func preparePlacement(p domain.Placement) (domain.Placement, error) {
	if p.TerritorySlug == "" || p.ModelSlug == "" {
		return domain.Placement{}, fmt.Errorf("%w: territory and model slugs are required", domain.ErrInvalidInput)
	}
	p.Scale = defaultScale(p.Scale)
	if p.Scale.X <= 0 || p.Scale.Y <= 0 || p.Scale.Z <= 0 {
		return domain.Placement{}, fmt.Errorf("%w: scale components must be positive", domain.ErrInvalidInput)
	}
	return p, nil
}

// UpdatePlacement replaces the transform and label of an existing placement.
// The catalog scopes the lookup by p.TerritorySlug.
func (g *Gateway) UpdatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	if p.TerritorySlug == "" {
		return domain.Placement{}, fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	}
	if p.ID == 0 {
		return domain.Placement{}, fmt.Errorf("%w: id is required", domain.ErrInvalidInput)
	}
	p.Scale = defaultScale(p.Scale)
	if p.Scale.X <= 0 || p.Scale.Y <= 0 || p.Scale.Z <= 0 {
		return domain.Placement{}, fmt.Errorf("%w: scale components must be positive", domain.ErrInvalidInput)
	}
	return g.catalog.UpdatePlacement(ctx, p)
}

// SetPlacementVisibility replaces a placement's panorama allowlist. The
// catalog enforces that every id belongs to the territory.
func (g *Gateway) SetPlacementVisibility(ctx context.Context, territorySlug string, placementID int64, panoramaIDs []int64) (domain.Placement, error) {
	if territorySlug == "" {
		return domain.Placement{}, fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	}
	if placementID <= 0 {
		return domain.Placement{}, fmt.Errorf("%w: id is required", domain.ErrInvalidInput)
	}
	return g.catalog.SetPlacementVisibility(ctx, territorySlug, placementID, panoramaIDs)
}

// DeletePlacement removes a placement on territorySlug by ID.
func (g *Gateway) DeletePlacement(ctx context.Context, territorySlug string, id int64) error {
	if territorySlug == "" {
		return fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	}
	if id <= 0 {
		return fmt.Errorf("%w: id is required", domain.ErrInvalidInput)
	}
	return g.catalog.DeletePlacement(ctx, territorySlug, id)
}

// defaultScale replaces a zero-value Vec3 with {1,1,1}.
func defaultScale(s domain.Vec3) domain.Vec3 {
	if s == (domain.Vec3{}) {
		return domain.Vec3{X: 1, Y: 1, Z: 1}
	}
	return s
}
