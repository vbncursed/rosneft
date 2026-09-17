package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// UpdatePanorama replaces title, position, and yaw_offset; the source
// blob and slug are immutable after creation (a new equirect = a new
// panorama). The update is scoped to p.TerritorySlug, so an id from another
// territory yields ErrPanoramaNotFound exactly like an unknown id — the
// gateway's territory gate checks only the slug in the URL.
//
// Wrapped in audittx.Run so the audit trigger can attribute the change.
func (r *PG) UpdatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error) {
	const q = `
		WITH updated AS (
			UPDATE panoramas pa SET
				title      = $2,
				position_x = $3, position_y = $4, position_z = $5,
				yaw_offset = $6,
				default_yaw = $7,
				updated_at = NOW()
			FROM territories t
			WHERE pa.id = $1 AND pa.territory_id = t.id AND t.slug = $8
			RETURNING pa.id, pa.territory_id, pa.slug, pa.title, pa.source_blob_hash,
				pa.position_x, pa.position_y, pa.position_z,
				pa.yaw_offset, pa.default_yaw, pa.created_at, pa.updated_at
		)
		SELECT u.id, t.slug, u.slug, u.title, u.source_blob_hash,
			u.position_x, u.position_y, u.position_z,
			u.yaw_offset, u.default_yaw, u.created_at, u.updated_at
		FROM updated u
		JOIN territories t ON t.id = u.territory_id`

	var out domain.Panorama
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, q,
			p.ID, p.Title,
			p.Position.X, p.Position.Y, p.Position.Z,
			p.YawOffset, p.DefaultYaw, p.TerritorySlug,
		)
		var scanErr error
		out, scanErr = scanPanorama(row)
		return scanErr
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Panorama{}, domain.ErrPanoramaNotFound
		}
		return domain.Panorama{}, fmt.Errorf("storage.UpdatePanorama: %w", err)
	}
	return out, nil
}
