package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
)

// DeleteMeasurements removes every measurement on territorySlug and returns
// how many went. The audit trigger files one entry per removed row. An unknown
// territory deletes nothing and returns 0 rather than ErrTerritoryNotFound: the
// gateway's territory gate answers 404 before this is reached.
//
// Wrapped in audittx.Run so the audit trigger can attribute the deletes.
func (r *PG) DeleteMeasurements(ctx context.Context, territorySlug string) (int, error) {
	var affected int64
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		tag, execErr := tx.Exec(ctx, `
			DELETE FROM measurements m
			USING territories t
			WHERE m.territory_id = t.id AND t.slug = $1`,
			territorySlug)
		affected = tag.RowsAffected()
		return execErr
	})
	if err != nil {
		return 0, fmt.Errorf("storage.DeleteMeasurements: %w", err)
	}
	return int(affected), nil
}
