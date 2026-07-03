package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// DeletePanorama removes a panorama by ID.
func (c *Content) DeletePanorama(ctx context.Context, id int64) error {
	if id <= 0 {
		return fmt.Errorf("service.DeletePanorama: %w: id is required", domain.ErrInvalidInput)
	}
	return c.repo.DeletePanorama(ctx, id)
}
