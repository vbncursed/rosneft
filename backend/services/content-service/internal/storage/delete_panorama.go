package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// DeletePanorama removes a panorama by ID. An unknown ID returns
// ErrPanoramaNotFound so the service layer can surface it as 404
// rather than a silent 204. The scrub CTE strips the id from every
// placement allowlist in the same statement, keeping visibility sets free
// of dangling references.
//
// Wrapped in audittx.Run so the audit trigger can attribute both writes: the
// panorama delete and every placement the scrub touches are logged under the
// same actor, which is what makes the knock-on visibility changes traceable.
func (r *PG) DeletePanorama(ctx context.Context, id int64) error {
	const q = `
		WITH scrub AS (
			UPDATE placements
			SET visible_panorama_ids = array_remove(visible_panorama_ids, $1)
			WHERE $1 = ANY(visible_panorama_ids)
		)
		DELETE FROM panoramas WHERE id = $1`

	var affected int64
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		tag, execErr := tx.Exec(ctx, q, id)
		if execErr != nil {
			return execErr
		}
		affected = tag.RowsAffected()
		return nil
	})
	if err != nil {
		return fmt.Errorf("storage.DeletePanorama: %w", err)
	}
	if affected == 0 {
		return domain.ErrPanoramaNotFound
	}
	return nil
}
