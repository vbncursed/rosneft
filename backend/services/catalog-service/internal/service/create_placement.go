package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreatePlacement validates the input, fills in defaults for the transform,
// and persists the placement. Defaults: scale {1,1,1}, position/rotation
// zero, label empty.
func (c *Catalog) CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	p, err := preparePlacement(p)
	if err != nil {
		return domain.Placement{}, fmt.Errorf("service.CreatePlacement: %w", err)
	}
	if len(p.VisiblePanoramaIDs) > 0 {
		if err := c.requirePanoramasOnTerritory(ctx, p.TerritorySlug, p.VisiblePanoramaIDs); err != nil {
			return domain.Placement{}, fmt.Errorf("service.CreatePlacement: %w", err)
		}
	}
	return c.repo.CreatePlacement(ctx, p)
}

// preparePlacement checks the slugs, fills the default scale and rejects a
// non-positive one: the checks a single create and every batch item share.
func preparePlacement(p domain.Placement) (domain.Placement, error) {
	if p.TerritorySlug == "" || p.ModelSlug == "" {
		return domain.Placement{}, fmt.Errorf("%w: territory_slug and model_slug are required", domain.ErrInvalidInput)
	}
	p.Scale = defaultScale(p.Scale)
	if p.Scale.X <= 0 || p.Scale.Y <= 0 || p.Scale.Z <= 0 {
		return domain.Placement{}, fmt.Errorf("%w: scale components must be positive", domain.ErrInvalidInput)
	}
	return p, nil
}

// defaultScale replaces a zero-value Vec3 with {1,1,1} (uniform unit scale).
// Mixed inputs (e.g. {2, 0, 0}) are left alone so the validation step can
// reject them — prevents silent "I asked for X but got 1" surprises.
func defaultScale(s domain.Vec3) domain.Vec3 {
	if s == (domain.Vec3{}) {
		return domain.Vec3{X: 1, Y: 1, Z: 1}
	}
	return s
}
