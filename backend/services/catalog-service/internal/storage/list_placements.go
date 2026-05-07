package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListPlacements returns every placement attached to a parent project, ordered
// by creation time. An unknown parent slug yields ErrProjectNotFound rather
// than an empty list — the caller wants to distinguish "no placements yet"
// from "no such project".
func (r *PG) ListPlacements(ctx context.Context, parentSlug string) ([]domain.Placement, error) {
	if _, err := r.GetProject(ctx, parentSlug); err != nil {
		return nil, err
	}

	const q = `SELECT ` + placementSelectCols + `
		FROM ` + placementJoin + `
		WHERE pp.slug = $1
		ORDER BY pl.created_at`

	rows, err := r.pool.Query(ctx, q, parentSlug)
	if err != nil {
		return nil, fmt.Errorf("storage.ListPlacements: query: %w", err)
	}
	defer rows.Close()

	out := make([]domain.Placement, 0)
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
	return out, nil
}
