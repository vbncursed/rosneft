package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// ListPanoramaPhases returns the three phases of a territory, prior → current
// → post, with their shared hidden flags.
func (c *Content) ListPanoramaPhases(ctx context.Context, territorySlug string) ([]domain.PanoramaPhaseVisibility, error) {
	if territorySlug == "" {
		return nil, fmt.Errorf("service.ListPanoramaPhases: %w: empty territory slug", domain.ErrInvalidInput)
	}
	return c.repo.ListPanoramaPhases(ctx, territorySlug)
}
