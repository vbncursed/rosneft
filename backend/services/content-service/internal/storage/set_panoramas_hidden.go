package storage

import "context"

// setPanoramasHiddenQuery is updatePanoramas' statement for the hidden flag.
const setPanoramasHiddenQuery = `
	UPDATE panoramas pa SET hidden = $3, updated_at = NOW()
	FROM territories t
	WHERE pa.territory_id = t.id AND t.slug = $1 AND pa.id = ANY($2)`

// SetPanoramasHidden hides or shows every panorama in ids on territorySlug,
// all or none, and answers how many it wrote. Hiding is shared, so it is
// audited like any other edit.
func (r *PG) SetPanoramasHidden(ctx context.Context, territorySlug string, ids []int64, hidden bool) (int, error) {
	return r.updatePanoramas(ctx, "storage.SetPanoramasHidden", setPanoramasHiddenQuery, territorySlug, ids, hidden)
}
