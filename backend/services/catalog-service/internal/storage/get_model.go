package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// GetModel returns a single model by slug.
func (r *PG) GetModel(ctx context.Context, slug string) (domain.Model, error) {
	const q = `SELECT ` + entityColumns + ` FROM models WHERE slug = $1`

	row := r.pool.QueryRow(ctx, q, slug)
	m, err := scanModel(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Model{}, domain.ErrModelNotFound
		}
		return domain.Model{}, fmt.Errorf("storage.GetModel: %w", err)
	}
	return m, nil
}
