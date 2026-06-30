package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListPanoramas returns every panorama attached to a territory, ordered
// by creation time. An unknown territory yields ErrTerritoryNotFound
// rather than an empty list so callers distinguish "no panoramas yet"
// from "no such territory".
func (r *PG) ListPanoramas(ctx context.Context, territorySlug string) ([]domain.Panorama, error) {
	if _, err := r.GetTerritory(ctx, territorySlug, ""); err != nil { // existence check; scoped at gateway
		return nil, err
	}

	const q = `SELECT ` + panoramaSelectCols + `
		FROM ` + panoramaJoin + `
		WHERE t.slug = $1
		ORDER BY pa.created_at`

	rows, err := r.pool.Query(ctx, q, territorySlug)
	if err != nil {
		return nil, fmt.Errorf("storage.ListPanoramas: query: %w", err)
	}
	defer rows.Close()

	out := make([]domain.Panorama, 0, 4)
	for rows.Next() {
		p, err := scanPanorama(rows)
		if err != nil {
			return nil, fmt.Errorf("storage.ListPanoramas: scan: %w", err)
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListPanoramas: iter: %w", err)
	}
	return out, nil
}
