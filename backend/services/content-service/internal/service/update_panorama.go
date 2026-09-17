package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// UpdatePanorama replaces title, position, and yaw_offset on an existing
// panorama. The source equirect and slug are immutable. TerritorySlug scopes
// the lookup — a panorama on another territory is ErrPanoramaNotFound.
func (c *Content) UpdatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error) {
	if p.TerritorySlug == "" {
		return domain.Panorama{}, fmt.Errorf("service.UpdatePanorama: %w: empty territory slug", domain.ErrInvalidInput)
	}
	if p.ID == 0 {
		return domain.Panorama{}, fmt.Errorf("service.UpdatePanorama: %w: id is required", domain.ErrInvalidInput)
	}
	if p.Title == "" {
		return domain.Panorama{}, fmt.Errorf("service.UpdatePanorama: %w: title is required", domain.ErrInvalidInput)
	}
	return c.repo.UpdatePanorama(ctx, p)
}
