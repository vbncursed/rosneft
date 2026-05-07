package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpsertTerritory inserts or updates a territory by slug. Returns the
// row as stored, including timestamps assigned by the database.
func (r *PG) UpsertTerritory(ctx context.Context, t domain.Territory) (domain.Territory, error) {
	const q = `
		INSERT INTO territories (slug, title, description, source_blob_hash)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (slug) DO UPDATE SET
			title            = EXCLUDED.title,
			description      = EXCLUDED.description,
			source_blob_hash = EXCLUDED.source_blob_hash,
			updated_at       = NOW()
		RETURNING ` + entityColumns

	row := r.pool.QueryRow(ctx, q, t.Slug, t.Title, t.Description, t.SourceBlobHash)
	out, err := scanTerritory(row)
	if err != nil {
		return domain.Territory{}, fmt.Errorf("storage.UpsertTerritory: %w", err)
	}
	return out, nil
}
