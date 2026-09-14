package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// GetModel returns a single model by slug, with the count of distinct
// territories placing it — the same correlated subquery ListModels uses, so
// a model's page and the library agree on the number.
func (r *PG) GetModel(ctx context.Context, slug string) (domain.Model, error) {
	const q = `SELECT m.slug, m.title, m.description, m.source_blob_hash, m.thumbnail_blob_hash, m.created_at, m.updated_at,
       (SELECT COUNT(DISTINCT p.territory_id) FROM placements p WHERE p.model_id = m.id) AS usage_count
FROM models m WHERE m.slug = $1`

	row := r.pool.QueryRow(ctx, q, slug)
	m, err := scanModelListed(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Model{}, domain.ErrModelNotFound
		}
		return domain.Model{}, fmt.Errorf("storage.GetModel: %w", err)
	}
	return m, nil
}
