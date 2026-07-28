package storage

import (
	"context"
	"fmt"
)

// ResolveTerritorySlugs maps territory ids to slugs.
//
// Deliberately unscoped by territory_assignments, unlike ListTerritories: the
// caller is labelling audit entries its own scope already released, and a slug
// next to an id the reader can see discloses nothing further. Ids that match
// nothing are absent from the result rather than an error — the journal outlives
// the territories it describes.
func (r *PG) ResolveTerritorySlugs(ctx context.Context, ids []int64) (map[int64]string, error) {
	const q = `SELECT t.id, t.slug FROM territories t WHERE t.id = ANY($1)`
	rows, err := r.pool.Query(ctx, q, ids)
	if err != nil {
		return nil, fmt.Errorf("storage.ResolveTerritorySlugs: %w", err)
	}
	defer rows.Close()

	out := make(map[int64]string, len(ids))
	for rows.Next() {
		var (
			id   int64
			slug string
		)
		if err := rows.Scan(&id, &slug); err != nil {
			return nil, fmt.Errorf("storage.ResolveTerritorySlugs: scan: %w", err)
		}
		out[id] = slug
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ResolveTerritorySlugs: rows: %w", err)
	}
	return out, nil
}
