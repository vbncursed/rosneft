package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpdatePanorama replaces title, position, and yaw_offset on an existing
// panorama. The source equirect and slug are immutable.
func (c *Catalog) UpdatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error) {
	if p.ID == 0 {
		return domain.Panorama{}, fmt.Errorf("service.UpdatePanorama: %w: id is required", domain.ErrInvalidInput)
	}
	if p.Title == "" {
		return domain.Panorama{}, fmt.Errorf("service.UpdatePanorama: %w: title is required", domain.ErrInvalidInput)
	}
	return c.repo.UpdatePanorama(ctx, p)
}
