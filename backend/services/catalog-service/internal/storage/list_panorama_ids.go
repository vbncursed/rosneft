package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListPanoramaIDs returns the IDs of panoramas anchored to a territory.
// Panoramas are owned by content-service, but they live in the same shared DB;
// catalog reads their IDs read-only to validate placement visibility
// allowlists. An unknown territory yields ErrTerritoryNotFound (matching the
// former ListPanoramas semantics) so callers distinguish "no panoramas yet"
// from "no such territory".
func (r *PG) ListPanoramaIDs(ctx context.Context, territorySlug string) ([]int64, error) {
	const existsQ = `SELECT 1 FROM territories WHERE slug = $1`
	var one int
	if err := r.pool.QueryRow(ctx, existsQ, territorySlug).Scan(&one); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrTerritoryNotFound
		}
		return nil, fmt.Errorf("storage.ListPanoramaIDs: territory check: %w", err)
	}

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
