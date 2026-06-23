package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// SetPlacementVisibility replaces a placement's panorama allowlist in full
// and bumps updated_at. The update is scoped to the territory so a placement
// id from another territory yields ErrPlacementNotFound rather than a
// cross-territory write. Visibility is independent of the transform, so this
// never touches position/rotation/scale.
func (r *PG) SetPlacementVisibility(ctx context.Context, territorySlug string, placementID int64, panoramaIDs []int64) (domain.Placement, error) {
	const q = `
		WITH updated AS (
			UPDATE placements pl SET
				visible_panorama_ids = COALESCE($3::bigint[], '{}'),
				updated_at = NOW()
			FROM territories t
			WHERE pl.id = $2 AND pl.territory_id = t.id AND t.slug = $1
			RETURNING pl.id, pl.territory_id, pl.model_id,
				pl.position_x, pl.position_y, pl.position_z,
				pl.rotation_x, pl.rotation_y, pl.rotation_z,
				pl.scale_x, pl.scale_y, pl.scale_z,
				pl.label, pl.created_at, pl.updated_at, pl.visible_panorama_ids
		)
		SELECT u.id, t.slug, m.slug,
			u.position_x, u.position_y, u.position_z,
			u.rotation_x, u.rotation_y, u.rotation_z,
			u.scale_x, u.scale_y, u.scale_z,
			u.label, u.created_at, u.updated_at, u.visible_panorama_ids
		FROM updated u
		JOIN territories t ON t.id = u.territory_id
		JOIN models m      ON m.id = u.model_id`

	row := r.pool.QueryRow(ctx, q, territorySlug, placementID, panoramaIDs)
	out, err := scanPlacement(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Placement{}, domain.ErrPlacementNotFound
		}
		return domain.Placement{}, fmt.Errorf("storage.SetPlacementVisibility: %w", err)
	}
	return out, nil
}
