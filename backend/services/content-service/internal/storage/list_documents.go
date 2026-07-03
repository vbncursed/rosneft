package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// ListDocuments returns every document attached to a territory, ordered by
// creation time. An unknown territory yields ErrTerritoryNotFound rather than
// an empty list so callers distinguish "no documents yet" from "no such
// territory".
func (r *PG) ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error) {
	if err := r.requireTerritory(ctx, territorySlug); err != nil { // existence check; scoped at gateway
		return nil, err
	}

	const q = `SELECT ` + documentSelectCols + `
		FROM ` + documentJoin + `
		WHERE t.slug = $1
		ORDER BY d.created_at`

	rows, err := r.pool.Query(ctx, q, territorySlug)
	if err != nil {
		return nil, fmt.Errorf("storage.ListDocuments: query: %w", err)
	}
	defer rows.Close()

	out := make([]domain.Document, 0, 4)
	for rows.Next() {
		d, err := scanDocument(rows)
		if err != nil {
			return nil, fmt.Errorf("storage.ListDocuments: scan: %w", err)
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListDocuments: iter: %w", err)
	}
	return out, nil
}
