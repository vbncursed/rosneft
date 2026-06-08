package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeletePanorama removes a panorama by ID. An unknown ID returns
// ErrPanoramaNotFound so the service layer can surface it as 404
// rather than a silent 204.
func (r *PG) DeletePanorama(ctx context.Context, id int64) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM panoramas WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("storage.DeletePanorama: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrPanoramaNotFound
	}
	return nil
}
