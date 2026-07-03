package storage

import (
	"context"
	"fmt"
)

// ListPanoramaIDs returns the IDs of panoramas anchored to a territory.
// Panoramas are owned by content-service, but they live in the same shared DB;
// catalog reads their IDs read-only to validate placement visibility
// allowlists. Returns an empty slice when the territory has none (or is
// unknown), which makes any non-empty allowlist fail validation upstream.
func (r *PG) ListPanoramaIDs(ctx context.Context, territorySlug string) ([]int64, error) {
	const q = `SELECT pa.id
		FROM panoramas pa
		JOIN territories t ON t.id = pa.territory_id
		WHERE t.slug = $1
		ORDER BY pa.id`

	rows, err := r.pool.Query(ctx, q, territorySlug)
	if err != nil {
		return nil, fmt.Errorf("storage.ListPanoramaIDs: query: %w", err)
	}
	defer rows.Close()

	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("storage.ListPanoramaIDs: scan: %w", err)
		}
		out = append(out, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListPanoramaIDs: iter: %w", err)
	}
	return out, nil
}
