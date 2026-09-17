package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeletePlacement removes a placement on territorySlug by ID. Idempotent only
// at the storage level: an unknown ID — or one on another territory, which the
// gateway's slug-only gate cannot tell apart — returns ErrPlacementNotFound so
// the service layer can surface it as a 404 instead of a silent 204.
//
// Wrapped in audittx.Run so the audit trigger can attribute the delete.
func (r *PG) DeletePlacement(ctx context.Context, territorySlug string, id int64) error {
	var affected int64
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		tag, execErr := tx.Exec(ctx, `
			DELETE FROM placements pl
			USING territories t
			WHERE pl.id = $2 AND pl.territory_id = t.id AND t.slug = $1`,
			territorySlug, id)
		if execErr != nil {
			return execErr
		}
		affected = tag.RowsAffected()
		return nil
	})
	if err != nil {
		return fmt.Errorf("storage.DeletePlacement: %w", err)
	}
	if affected == 0 {
		return domain.ErrPlacementNotFound
	}
	return nil
}
