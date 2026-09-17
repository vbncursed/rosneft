package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// DeletePanorama removes a panorama on territorySlug by ID. A panorama on
// another territory is ErrPanoramaNotFound, same as an unknown id.
func (c *Content) DeletePanorama(ctx context.Context, territorySlug string, id int64) error {
	if territorySlug == "" {
		return fmt.Errorf("service.DeletePanorama: %w: empty territory slug", domain.ErrInvalidInput)
	}
	if id <= 0 {
		return fmt.Errorf("service.DeletePanorama: %w: id is required", domain.ErrInvalidInput)
	}
	return c.repo.DeletePanorama(ctx, territorySlug, id)
}
