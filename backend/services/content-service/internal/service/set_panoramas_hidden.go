package service

import (
	"context"
	"fmt"
)

// SetPanoramasHidden hides or shows every panorama in ids on territorySlug,
// all or none; a repeated id counts once. Answers how many were written.
func (c *Content) SetPanoramasHidden(ctx context.Context, territorySlug string, ids []int64, hidden bool) (int, error) {
	ids, err := distinctPanoramaIDs(territorySlug, ids)
	if err != nil {
		return 0, fmt.Errorf("service.SetPanoramasHidden: %w", err)
	}
	return c.repo.SetPanoramasHidden(ctx, territorySlug, ids, hidden)
}
