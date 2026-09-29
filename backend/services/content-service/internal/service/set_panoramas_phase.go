package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// SetPanoramasPhase moves every panorama in ids on territorySlug into phase,
// all or none; a repeated id counts once. A phase outside the three is
// ErrInvalidInput. Answers how many were written.
func (c *Content) SetPanoramasPhase(ctx context.Context, territorySlug string, ids []int64, phase string) (int, error) {
	p, err := domain.ParsePanoramaPhase(phase)
	if err != nil {
		return 0, fmt.Errorf("service.SetPanoramasPhase: %w", err)
	}
	ids, err = distinctPanoramaIDs(territorySlug, ids)
	if err != nil {
		return 0, fmt.Errorf("service.SetPanoramasPhase: %w", err)
	}
	return c.repo.SetPanoramasPhase(ctx, territorySlug, ids, p)
}
