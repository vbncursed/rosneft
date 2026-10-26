package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpdateModel writes the patch's non-nil fields and nothing else — see
// UpdateTerritory for why it is one COALESCE statement and not an upsert.
//
// Wrapped in audittx.Run so the audit trigger can attribute the change.
func (r *PG) UpdateModel(ctx context.Context, slug string, p domain.ModelPatch) (domain.Model, error) {
	const q = `
		WITH m AS (
			UPDATE models SET
				title               = COALESCE($2, title),
				description         = COALESCE($3, description),
				thumbnail_blob_hash = COALESCE($4, thumbnail_blob_hash),
				tag_id              = CASE WHEN $5::text IS NULL THEN tag_id
				                           ELSE (SELECT id FROM model_tags WHERE slug = $5) END,
				updated_at          = NOW()
			WHERE slug = $1
			RETURNING ` + entityColumns + `)
		SELECT ` + modelSelect + ` FROM m ` + modelTagJoin

	var out domain.Model
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		var scanErr error
		out, scanErr = scanModel(tx.QueryRow(ctx, q, slug, p.Title, p.Description, p.ThumbnailBlobHash, p.TagSlug))
		return scanErr
	})
	switch {
	case err == nil:
		return out, nil
	case errors.Is(err, pgx.ErrNoRows):
		return domain.Model{}, domain.ErrModelNotFound
	case isUnknownTag(err):
		return domain.Model{}, errUnknownTag(*p.TagSlug)
	default:
		return domain.Model{}, fmt.Errorf("storage.UpdateModel: %w", err)
	}
}
