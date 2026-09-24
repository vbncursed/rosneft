package storage

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// setPlacementsGroupQuery is updatePlacements' statement for the group column.
const setPlacementsGroupQuery = `
	UPDATE placements pl SET group_id = $3, updated_at = NOW()
	FROM territories t
	WHERE pl.territory_id = t.id AND t.slug = $1 AND pl.id = ANY($2)`

// SetPlacementsGroup moves every placement in ids on territorySlug into
// groupID, or out of any group when it is nil, all or none. A group of another
// territory fails the composite FK and is ErrPlacementGroupNotFound, the same
// as an unknown one.
func (r *PG) SetPlacementsGroup(ctx context.Context, territorySlug string, ids []int64, groupID *int64) (int, error) {
	n, err := r.updatePlacements(ctx, "storage.SetPlacementsGroup", setPlacementsGroupQuery, territorySlug, ids, groupID)
	if isGroupFKViolation(err) {
		return 0, domain.ErrPlacementGroupNotFound
	}
	return n, err
}
