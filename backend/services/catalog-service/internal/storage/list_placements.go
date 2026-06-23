package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListPlacements returns every placement attached to a territory, ordered
// by creation time. An unknown territory yields ErrTerritoryNotFound rather
// than an empty list — the caller wants to distinguish "no placements yet"
// from "no such territory".
func (r *PG) ListPlacements(ctx context.Context, territorySlug string) ([]domain.Placement, error) {
	if _, err := r.GetTerritory(ctx, territorySlug); err != nil {
		return nil, err
	}

	const q = `SELECT ` + placementSelectCols + `
		FROM ` + placementJoin + `
		WHERE t.slug = $1
		ORDER BY pl.created_at`

	rows, err := r.pool.Query(ctx, q, territorySlug)
	if err != nil {
		return nil, fmt.Errorf("storage.ListPlacements: query: %w", err)
	}
	defer rows.Close()

	// 16 placements per territory is the typical scene; preallocate to
	// avoid slice growth copies during the SceneBundle hot path.
	out := make([]domain.Placement, 0, 16)
	for rows.Next() {
		p, err := scanPlacement(rows)
		if err != nil {
			return nil, fmt.Errorf("storage.ListPlacements: scan: %w", err)
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListPlacements: iter: %w", err)
	}

	// Stitch per-panorama names in one extra round-trip rather than an N+1.
	labels, err := r.labelsByTerritory(ctx, territorySlug)
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i].PanoramaLabels = labels[out[i].ID]
	}
	return out, nil
}
