package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeletePlacement removes a placement by ID. Idempotent only at the storage
// level: an unknown ID returns ErrPlacementNotFound so the service layer can
// surface it as a 404 instead of a silent 204.
//
// Wrapped in audittx.Run so the audit trigger can attribute the delete.
func (r *PG) DeletePlacement(ctx context.Context, id int64) error {
	var affected int64
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		tag, execErr := tx.Exec(ctx, `DELETE FROM placements WHERE id = $1`, id)
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
