package storage

import (
	"context"
	"fmt"
)

// TableStats reports the journal's size for the growth alert.
//
// The row count is reltuples — the planner's estimate, refreshed by ANALYZE —
// not count(*). An exact count is a sequential scan, and running one every tick
// on the table that only ever grows is a strange way to find out that it grows.
// The alert fires on orders of magnitude, where an estimate is plenty.
// greatest(...,0) covers a table that has never been analysed, where reltuples
// is -1.
func (r *PG) TableStats(ctx context.Context) (rows, bytes int64, err error) {
	const q = `
		SELECT greatest(c.reltuples, 0)::bigint, pg_total_relation_size(c.oid)
		FROM pg_class c WHERE c.oid = 'audit_log'::regclass`

	if err := r.pool.QueryRow(ctx, q).Scan(&rows, &bytes); err != nil {
		return 0, 0, fmt.Errorf("storage.TableStats: %w", err)
	}
	return rows, bytes, nil
}
