package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListMeasurements returns every measurement on a territory in id order. An
// unknown territory is ErrTerritoryNotFound, not an empty list.
func (r *PG) ListMeasurements(ctx context.Context, territorySlug string) ([]domain.Measurement, error) {
	if _, err := r.GetTerritory(ctx, territorySlug, ""); err != nil { // existence check; scoped at gateway
		return nil, err
	}
	rows, err := r.pool.Query(ctx, `SELECT `+measurementCols+`
		FROM measurements m JOIN territories t ON t.id = m.territory_id
		WHERE t.slug = $1
		ORDER BY m.id`, territorySlug)
	if err != nil {
		return nil, fmt.Errorf("storage.ListMeasurements: query: %w", err)
	}
	defer rows.Close()

	out := []domain.Measurement{}
	for rows.Next() {
		m, err := scanMeasurement(rows)
		if err != nil {
			return nil, fmt.Errorf("storage.ListMeasurements: scan: %w", err)
		}
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListMeasurements: iter: %w", err)
	}
	return out, nil
}
