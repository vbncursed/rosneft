package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeletePlacement removes a placement by ID. Idempotent only at the storage
// level: an unknown ID returns ErrPlacementNotFound so the service layer can
// surface it as a 404 instead of a silent 204.
func (r *PG) DeletePlacement(ctx context.Context, id int64) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM placements WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("storage.DeletePlacement: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrPlacementNotFound
	}
	return nil
}
