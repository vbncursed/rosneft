package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeleteMeasurement removes one measurement on territorySlug. An unknown id —
// or one on another territory — is ErrMeasurementNotFound, so the caller gets
// a 404 rather than a silent 204.
//
// Wrapped in audittx.Run so the audit trigger can attribute the delete.
func (r *PG) DeleteMeasurement(ctx context.Context, territorySlug string, id int64) error {
	var affected int64
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		tag, execErr := tx.Exec(ctx, `
			DELETE FROM measurements m
			USING territories t
			WHERE m.id = $2 AND m.territory_id = t.id AND t.slug = $1`,
			territorySlug, id)
		affected = tag.RowsAffected()
		return execErr
	})
	if err != nil {
		return fmt.Errorf("storage.DeleteMeasurement: %w", err)
	}
	if affected == 0 {
		return domain.ErrMeasurementNotFound
	}
	return nil
}
