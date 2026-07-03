package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// DeletePanorama removes a panorama by ID. An unknown ID returns
// ErrPanoramaNotFound so the service layer can surface it as 404
// rather than a silent 204. The scrub CTE strips the id from every
// placement allowlist in the same statement, keeping visibility sets free
// of dangling references.
func (r *PG) DeletePanorama(ctx context.Context, id int64) error {
	const q = `
		WITH scrub AS (
			UPDATE placements
			SET visible_panorama_ids = array_remove(visible_panorama_ids, $1)
			WHERE $1 = ANY(visible_panorama_ids)
		)
		DELETE FROM panoramas WHERE id = $1`

	tag, err := r.pool.Exec(ctx, q, id)
	if err != nil {
		return fmt.Errorf("storage.DeletePanorama: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrPanoramaNotFound
	}
	return nil
}
