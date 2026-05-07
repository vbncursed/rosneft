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

	// 64 models covers the typical catalog without realloc;
	// the slice will grow naturally if the catalog gets larger.
	out := make([]domain.Model, 0, 64)
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
