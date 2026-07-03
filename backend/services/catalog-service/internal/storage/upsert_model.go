package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpsertModel inserts or updates a model by slug.
func (r *PG) UpsertModel(ctx context.Context, m domain.Model) (domain.Model, error) {
	const q = `
		INSERT INTO models (slug, title, description, source_blob_hash, thumbnail_blob_hash)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (slug) DO UPDATE SET
			title               = EXCLUDED.title,
			description         = EXCLUDED.description,
			source_blob_hash    = EXCLUDED.source_blob_hash,
			thumbnail_blob_hash = EXCLUDED.thumbnail_blob_hash,
			updated_at          = NOW()
		RETURNING ` + entityColumns

	row := r.pool.QueryRow(ctx, q, m.Slug, m.Title, m.Description, m.SourceBlobHash, m.ThumbnailBlobHash)
	out, err := scanModel(row)
	if err != nil {
		return domain.Model{}, fmt.Errorf("storage.UpsertModel: %w", err)
	}
	return out, nil
}
