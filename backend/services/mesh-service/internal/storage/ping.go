package storage

import "context"

// Ping verifies Redis is reachable. Used by readiness probes.
func (r *Redis) Ping(ctx context.Context) error {
	return r.client.Ping(ctx).Err()
}
