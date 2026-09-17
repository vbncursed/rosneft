package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// DeletePanorama removes a panorama on territorySlug by ID. An unknown ID —
// or one on another territory, which the gateway's slug-only gate cannot tell
// apart — returns ErrPanoramaNotFound so the service layer can surface it as
// 404 rather than a silent 204. The scrub CTE strips the id from the
// allowlists of that territory's placements in the same statement, keeping
// visibility sets free of dangling references. It joins through target, so a
// refused delete scrubs nothing: every CTE runs whether or not the outer
// DELETE matches a row.
//
// Wrapped in audittx.Run so the audit trigger can attribute both writes: the
// panorama delete and every placement the scrub touches are logged under the
// same actor, which is what makes the knock-on visibility changes traceable.
func (r *PG) DeletePanorama(ctx context.Context, territorySlug string, id int64) error {
	const q = `
		WITH target AS (
			SELECT pa.id, pa.territory_id
			FROM panoramas pa
			JOIN territories t ON t.id = pa.territory_id
			WHERE pa.id = $2 AND t.slug = $1
		), scrub AS (
			UPDATE placements pl
			SET visible_panorama_ids = array_remove(pl.visible_panorama_ids, target.id)
			FROM target
			WHERE pl.territory_id = target.territory_id
				AND target.id = ANY(pl.visible_panorama_ids)
		)
		DELETE FROM panoramas pa USING target WHERE pa.id = target.id`

	var affected int64
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		tag, execErr := tx.Exec(ctx, q, territorySlug, id)
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
