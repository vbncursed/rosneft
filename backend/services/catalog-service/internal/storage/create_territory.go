package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreateTerritory inserts a new territory under the exact slug given. Unlike
// UpsertTerritory it never updates an existing row: a slug collision yields
// ErrSlugConflict so the service can retry with the next candidate.
func (r *PG) CreateTerritory(ctx context.Context, t domain.Territory) (domain.Territory, error) {
	const q = `
		INSERT INTO territories (slug, title, description, source_blob_hash, external_panorama_url)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING ` + territoryColumns

	row := r.pool.QueryRow(ctx, q, t.Slug, t.Title, t.Description, t.SourceBlobHash, t.ExternalPanoramaURL)
	out, err := scanTerritory(row)
	if err != nil {
		if isUniqueViolation(err) {
			return domain.Territory{}, domain.ErrSlugConflict
		}
		return domain.Territory{}, fmt.Errorf("storage.CreateTerritory: %w", err)
	}
	return out, nil
}
