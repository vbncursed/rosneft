package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreateTerritory inserts a new territory under the exact slug given. Unlike
// UpsertTerritory it never updates an existing row: a slug collision yields
// ErrSlugConflict so the service can retry with the next candidate.
//
// Runs through audittx.Run so the audit_capture() trigger sees who made the
// change. Outside that transaction the actor is invisible to the trigger and
// the row would be logged as a system change.
func (r *PG) CreateTerritory(ctx context.Context, t domain.Territory) (domain.Territory, error) {
	const q = `
		INSERT INTO territories (slug, title, description, source_blob_hash, external_panorama_url)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING ` + territoryColumns

	var out domain.Territory
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, q, t.Slug, t.Title, t.Description, t.SourceBlobHash, t.ExternalPanoramaURL)
		var scanErr error
		out, scanErr = scanTerritory(row)
		return scanErr
	})
	if err != nil {
		if isUniqueViolation(err) {
			return domain.Territory{}, domain.ErrSlugConflict
		}
		return domain.Territory{}, fmt.Errorf("storage.CreateTerritory: %w", err)
	}
	return out, nil
}
