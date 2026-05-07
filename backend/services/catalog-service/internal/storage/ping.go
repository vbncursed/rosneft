package storage

import "context"

// Ping verifies the database is reachable. Used by readiness probes.
func (r *PG) Ping(ctx context.Context) error {
	return r.pool.Ping(ctx)
}
