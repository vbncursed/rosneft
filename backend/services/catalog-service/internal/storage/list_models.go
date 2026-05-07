package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListModels returns every model ordered by slug.
func (r *PG) ListModels(ctx context.Context) ([]domain.Model, error) {
	const q = `SELECT ` + entityColumns + ` FROM models ORDER BY slug`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("storage.ListModels: query: %w", err)
	}
	defer rows.Close()

	out := make([]domain.Model, 0)
	for rows.Next() {
		m, err := scanModel(rows)
		if err != nil {
			return nil, fmt.Errorf("storage.ListModels: scan: %w", err)
		}
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListModels: iter: %w", err)
	}
	return out, nil
}
