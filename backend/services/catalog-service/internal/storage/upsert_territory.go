package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpsertTerritory inserts or updates a territory by slug. Returns the
// row as stored, including timestamps assigned by the database.
//
// Wrapped in audittx.Run so the audit trigger can attribute the change. Note
// the unconditional `updated_at = NOW()`: an upsert with identical values still
// bumps it, which is exactly why audit_capture() compares its snapshots with
// updated_at removed rather than logging a no-op change.
func (r *PG) UpsertTerritory(ctx context.Context, t domain.Territory) (domain.Territory, error) {
	const q = `
		INSERT INTO territories (slug, title, description, source_blob_hash, external_panorama_url)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (slug) DO UPDATE SET
			title                 = EXCLUDED.title,
			description           = EXCLUDED.description,
			source_blob_hash      = EXCLUDED.source_blob_hash,
			external_panorama_url = EXCLUDED.external_panorama_url,
			updated_at            = NOW()
		RETURNING ` + territoryColumns

	var out domain.Territory
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, q, t.Slug, t.Title, t.Description, t.SourceBlobHash, t.ExternalPanoramaURL)
		var scanErr error
		out, scanErr = scanTerritory(row)
		return scanErr
	})
	if err != nil {
		return domain.Territory{}, fmt.Errorf("storage.UpsertTerritory: %w", err)
	}
	return out, nil
}
