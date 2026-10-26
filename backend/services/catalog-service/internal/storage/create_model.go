package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreateModel inserts a new model under the exact slug given. It never
// updates an existing row: a slug collision yields ErrSlugConflict, which the
// service retries with the next candidate for a derived slug.
//
// The tag is resolved by slug inside the insert; a slug that names no tag is
// ErrInvalidInput, never a default.
//
// Wrapped in audittx.Run so the audit trigger can attribute the insert.
func (r *PG) CreateModel(ctx context.Context, m domain.Model) (domain.Model, error) {
	const q = `
		WITH m AS (
			INSERT INTO models (slug, title, description, source_blob_hash, thumbnail_blob_hash, tag_id)
			VALUES ($1, $2, $3, $4, $5, (SELECT id FROM model_tags WHERE slug = $6))
			RETURNING ` + entityColumns + `)
		SELECT ` + modelSelect + ` FROM m ` + modelTagJoin

	var out domain.Model
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, q, m.Slug, m.Title, m.Description, m.SourceBlobHash, m.ThumbnailBlobHash, m.Tag.Slug)
		var scanErr error
		out, scanErr = scanModel(row)
		return scanErr
	})
	if err != nil {
		if isUniqueViolation(err) {
			return domain.Model{}, domain.ErrSlugConflict
		}
		if isUnknownTag(err) {
			return domain.Model{}, errUnknownTag(m.Tag.Slug)
		}
		return domain.Model{}, fmt.Errorf("storage.CreateModel: %w", err)
	}
	return out, nil
}
