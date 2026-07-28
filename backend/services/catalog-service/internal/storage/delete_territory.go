package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeleteTerritory removes a territory by slug. Cascade-deletes its
// territory_artifacts and placements (placements have ON DELETE CASCADE).
// Returns ErrTerritoryNotFound if the slug isn't present.
//
// Wrapped in audittx.Run, which also attributes the cascade: the trigger fires
// once per placement, panorama and document the FK removes, so a single delete
// leaves a complete trail without anyone enumerating the children.
func (r *PG) DeleteTerritory(ctx context.Context, slug string) error {
	var affected int64
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		tag, execErr := tx.Exec(ctx, `DELETE FROM territories WHERE slug = $1`, slug)
		if execErr != nil {
			return execErr
		}
		affected = tag.RowsAffected()
		return nil
	})
	if err != nil {
		return fmt.Errorf("storage.DeleteTerritory: %w", err)
	}
	if affected == 0 {
		return domain.ErrTerritoryNotFound
	}
	return nil
}
