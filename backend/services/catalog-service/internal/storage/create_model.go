package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreateModel inserts a new model under the exact slug given. Unlike
// UpsertModel it never updates an existing row: a slug collision yields
// ErrSlugConflict so the service can retry with the next candidate.
func (r *PG) CreateModel(ctx context.Context, m domain.Model) (domain.Model, error) {
	const q = `
		INSERT INTO models (slug, title, description, source_blob_hash)
		VALUES ($1, $2, $3, $4)
		RETURNING ` + entityColumns

	row := r.pool.QueryRow(ctx, q, m.Slug, m.Title, m.Description, m.SourceBlobHash)
	out, err := scanModel(row)
	if err != nil {
		if isUniqueViolation(err) {
			return domain.Model{}, domain.ErrSlugConflict
		}
		return domain.Model{}, fmt.Errorf("storage.CreateModel: %w", err)
	}
	return out, nil
}
