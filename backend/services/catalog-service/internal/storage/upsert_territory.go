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
		INSERT INTO territories (slug, title, description, source_blob_hash, external_panorama_url)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (slug) DO UPDATE SET
			title                 = EXCLUDED.title,
			description           = EXCLUDED.description,
			source_blob_hash      = EXCLUDED.source_blob_hash,
			external_panorama_url = EXCLUDED.external_panorama_url,
			updated_at            = NOW()
		RETURNING ` + territoryColumns

	row := r.pool.QueryRow(ctx, q, t.Slug, t.Title, t.Description, t.SourceBlobHash, t.ExternalPanoramaURL)
	out, err := scanTerritory(row)
	if err != nil {
		return domain.Territory{}, fmt.Errorf("storage.UpsertTerritory: %w", err)
	}
	return out, nil
}
