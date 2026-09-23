package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpdateTerritory writes the patch's non-nil fields and nothing else, in one
// statement: a nil pointer binds NULL and COALESCE keeps the stored column. A
// read-merge-upsert would write back every column it read, reverting a source
// replace (or title edit) that landed in between.
//
// Wrapped in audittx.Run so the audit trigger can attribute the change.
func (r *PG) UpdateTerritory(ctx context.Context, slug string, p domain.TerritoryPatch) (domain.Territory, error) {
	const q = `
		UPDATE territories SET
			title                 = COALESCE($2, title),
			description           = COALESCE($3, description),
			external_panorama_url = COALESCE($4, external_panorama_url),
			source_blob_hash      = COALESCE($5, source_blob_hash),
			updated_at            = NOW()
		WHERE slug = $1
		RETURNING ` + territoryColumns

	var out domain.Territory
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		var scanErr error
		out, scanErr = scanTerritory(tx.QueryRow(ctx, q,
			slug, p.Title, p.Description, p.ExternalPanoramaURL, p.SourceBlobHash))
		return scanErr
	})
	switch {
	case err == nil:
		return out, nil
	case errors.Is(err, pgx.ErrNoRows):
		return domain.Territory{}, domain.ErrTerritoryNotFound
	default:
		return domain.Territory{}, fmt.Errorf("storage.UpdateTerritory: %w", err)
	}
}
