package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// GetTerritory returns a single territory by slug.
func (r *PG) GetTerritory(ctx context.Context, slug string) (domain.Territory, error) {
	const q = `SELECT ` + entityColumns + ` FROM territories WHERE slug = $1`

	row := r.pool.QueryRow(ctx, q, slug)
	t, err := scanTerritory(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Territory{}, domain.ErrTerritoryNotFound
		}
		return domain.Territory{}, fmt.Errorf("storage.GetTerritory: %w", err)
	}
	return t, nil
}
