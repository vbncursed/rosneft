package service

import (
	"context"
	"fmt"
)

// SetPlacementsGroup moves every placement in ids on territorySlug into
// groupID, or out of any group when it is nil, all or none. A group of another
// territory is ErrPlacementGroupNotFound (storage's composite FK).
func (c *Catalog) SetPlacementsGroup(ctx context.Context, territorySlug string, ids []int64, groupID *int64) (int, error) {
	ids, err := distinctPlacementIDs(territorySlug, ids)
	if err != nil {
		return 0, fmt.Errorf("service.SetPlacementsGroup: %w", err)
	}
	return c.repo.SetPlacementsGroup(ctx, territorySlug, ids, groupID)
}
