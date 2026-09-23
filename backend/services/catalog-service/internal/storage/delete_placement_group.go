package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeletePlacementGroup removes group id on territorySlug. Its placements stay:
// the FK's ON DELETE SET NULL (group_id) returns them to no group, and the
// trigger journals each as an update inside this transaction. An unknown id,
// or one on another territory, is ErrPlacementGroupNotFound.
func (r *PG) DeletePlacementGroup(ctx context.Context, territorySlug string, id int64) error {
	var affected int64
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		tag, execErr := tx.Exec(ctx, `
			DELETE FROM placement_groups g
			USING territories t
			WHERE g.id = $2 AND g.territory_id = t.id AND t.slug = $1`,
			territorySlug, id)
		affected = tag.RowsAffected()
		return execErr
	})
	if err != nil {
		return fmt.Errorf("storage.DeletePlacementGroup: %w", err)
	}
	if affected == 0 {
		return domain.ErrPlacementGroupNotFound
	}
	return nil
}
