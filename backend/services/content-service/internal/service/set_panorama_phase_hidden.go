package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// SetPanoramaPhaseHidden hides or shows a whole phase on territorySlug for
// every reader. A panorama hidden on its own stays hidden when its phase is
// shown again. A phase outside the three is ErrInvalidInput.
func (c *Content) SetPanoramaPhaseHidden(ctx context.Context, territorySlug, phase string, hidden bool) (domain.PanoramaPhaseVisibility, error) {
	if territorySlug == "" {
		return domain.PanoramaPhaseVisibility{}, fmt.Errorf("service.SetPanoramaPhaseHidden: %w: empty territory slug", domain.ErrInvalidInput)
	}
	p, err := domain.ParsePanoramaPhase(phase)
	if err != nil {
		return domain.PanoramaPhaseVisibility{}, fmt.Errorf("service.SetPanoramaPhaseHidden: %w", err)
	}
	return c.repo.SetPanoramaPhaseHidden(ctx, territorySlug, p, hidden)
}
