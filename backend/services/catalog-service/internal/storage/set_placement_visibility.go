package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// SetPlacementVisibility replaces a placement's panorama allowlist in full
// and bumps updated_at. The update is scoped to the territory so a placement
// id from another territory yields ErrPlacementNotFound rather than a
// cross-territory write. Visibility is independent of the transform, so this
// never touches position/rotation/scale.
//
// Wrapped in audittx.Run so the audit trigger can attribute the change.
func (r *PG) SetPlacementVisibility(ctx context.Context, territorySlug string, placementID int64, panoramaIDs []int64) (domain.Placement, error) {
	const q = `
		WITH w AS (
			UPDATE placements pl SET
				visible_panorama_ids = COALESCE($3::bigint[], '{}'),
				updated_at = NOW()
			FROM territories t
			WHERE pl.id = $2 AND pl.territory_id = t.id AND t.slug = $1
			RETURNING ` + placementWriteReturning + `
		)
		` + placementFromWrite

	var out domain.Placement
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, q, territorySlug, placementID, panoramaIDs)
		var scanErr error
		out, scanErr = scanPlacement(row)
		return scanErr
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Placement{}, domain.ErrPlacementNotFound
		}
		return domain.Placement{}, fmt.Errorf("storage.SetPlacementVisibility: %w", err)
	}
	return out, nil
}
