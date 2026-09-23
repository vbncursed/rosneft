package storage

import "context"

// setPlacementsHiddenQuery is updatePlacements' statement for the hidden flag.
const setPlacementsHiddenQuery = `
	UPDATE placements pl SET hidden = $3, updated_at = NOW()
	FROM territories t
	WHERE pl.territory_id = t.id AND t.slug = $1 AND pl.id = ANY($2)`

// SetPlacementsHidden hides or shows every placement in ids on territorySlug,
// all or none, and answers how many it wrote. Hiding is shared, so it is
// audited like any other edit.
func (r *PG) SetPlacementsHidden(ctx context.Context, territorySlug string, ids []int64, hidden bool) (int, error) {
	return r.updatePlacements(ctx, "storage.SetPlacementsHidden", setPlacementsHiddenQuery, territorySlug, ids, hidden)
}
