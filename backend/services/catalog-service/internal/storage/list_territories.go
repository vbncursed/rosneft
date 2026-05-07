package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListTerritories returns every territory ordered by slug for stable output.
func (r *PG) ListTerritories(ctx context.Context) ([]domain.Territory, error) {
	const q = `SELECT ` + entityColumns + ` FROM territories ORDER BY slug`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("storage.ListTerritories: query: %w", err)
	}
	defer rows.Close()

	// 32 territories covers the typical catalog without realloc;
	// the slice will grow naturally if the catalog gets larger.
	out := make([]domain.Territory, 0, 32)
	for rows.Next() {
		t, err := scanTerritory(rows)
		if err != nil {
			return nil, fmt.Errorf("storage.ListTerritories: scan: %w", err)
		}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListTerritories: iter: %w", err)
	}
	return out, nil
}
