package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeleteTerritory removes a territory by slug. Cascade-deletes its
// territory_artifacts and placements (placements have ON DELETE CASCADE).
// Returns ErrTerritoryNotFound if the slug isn't present.
func (r *PG) DeleteTerritory(ctx context.Context, slug string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM territories WHERE slug = $1`, slug)
	if err != nil {
		return fmt.Errorf("storage.DeleteTerritory: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrTerritoryNotFound
	}
	return nil
}
