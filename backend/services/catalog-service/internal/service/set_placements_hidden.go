package service

import (
	"context"
	"fmt"
)

// SetPlacementsHidden hides or shows every placement in ids on territorySlug,
// all or none; a repeated id counts once. Answers how many were written.
func (c *Catalog) SetPlacementsHidden(ctx context.Context, territorySlug string, ids []int64, hidden bool) (int, error) {
	ids, err := distinctPlacementIDs(territorySlug, ids)
	if err != nil {
		return 0, fmt.Errorf("service.SetPlacementsHidden: %w", err)
	}
	return c.repo.SetPlacementsHidden(ctx, territorySlug, ids, hidden)
}
