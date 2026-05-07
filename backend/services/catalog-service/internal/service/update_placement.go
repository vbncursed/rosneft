package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpdatePlacement replaces the transform + label of an existing placement.
// ParentSlug / AssetSlug on the input are ignored — clients cannot move a
// placement between projects via update; they delete and re-create instead.
func (c *Catalog) UpdatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error) {
	if p.ID == 0 {
		return domain.Placement{}, fmt.Errorf("service.UpdatePlacement: %w: id is required", domain.ErrInvalidInput)
	}
	p.Scale = defaultScale(p.Scale)
	if p.Scale.X <= 0 || p.Scale.Y <= 0 || p.Scale.Z <= 0 {
		return domain.Placement{}, fmt.Errorf("service.UpdatePlacement: %w: scale components must be positive", domain.ErrInvalidInput)
	}
	return c.repo.UpdatePlacement(ctx, p)
}
