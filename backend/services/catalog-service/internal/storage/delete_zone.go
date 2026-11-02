package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeleteZone removes zone id on territorySlug; its tag links go with it (ON
// DELETE CASCADE). An unknown id, or one on another territory, is
// ErrZoneNotFound.
//
// Wrapped in audittx.Run so the audit trigger can attribute the deletes.
func (r *PG) DeleteZone(ctx context.Context, territorySlug string, id int64) error {
	var affected int64
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		tag, execErr := tx.Exec(ctx, `
			DELETE FROM site_zones z
			USING territories t
			WHERE z.id = $2 AND z.territory_id = t.id AND t.slug = $1`,
			territorySlug, id)
		affected = tag.RowsAffected()
		return execErr
	})
	if err != nil {
		return fmt.Errorf("storage.DeleteZone: %w", err)
	}
	if affected == 0 {
		return domain.ErrZoneNotFound
	}
	return nil
}
