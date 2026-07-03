package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// CreatePanorama inserts a new panorama. A missing territory slug yields
// ErrTerritoryNotFound; a duplicate (territory_id, slug) yields
// ErrSlugConflict so the service can retry with the next slug candidate.
func (r *PG) CreatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error) {
	const q = `
		WITH inserted AS (
			INSERT INTO panoramas (
				territory_id, slug, title, source_blob_hash,
				position_x, position_y, position_z,
				yaw_offset
			)
			SELECT t.id, $2, $3, $4,
				$5, $6, $7,
				$8
			FROM territories t
			WHERE t.slug = $1
			RETURNING id, territory_id, slug, title, source_blob_hash,
				position_x, position_y, position_z,
				yaw_offset, created_at, updated_at
		)
		SELECT i.id, t.slug, i.slug, i.title, i.source_blob_hash,
			i.position_x, i.position_y, i.position_z,
			i.yaw_offset, i.created_at, i.updated_at
		FROM inserted i
		JOIN territories t ON t.id = i.territory_id`

	row := r.pool.QueryRow(ctx, q,
		p.TerritorySlug, p.Slug, p.Title, p.SourceBlobHash,
		p.Position.X, p.Position.Y, p.Position.Z,
		p.YawOffset,
	)
	out, err := scanPanorama(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Panorama{}, domain.ErrTerritoryNotFound
		}
		if isUniqueViolation(err) {
			return domain.Panorama{}, domain.ErrSlugConflict
		}
		return domain.Panorama{}, fmt.Errorf("storage.CreatePanorama: %w", err)
	}
	return out, nil
}
