package storage

import (
	"context"
	"fmt"
)

// EnsureTriggers attaches audit_capture() to every audited table that exists,
// returning how many were newly attached.
//
// Idempotent, and safe to run before the other services have migrated: missing
// tables are skipped and the next boot picks them up. That is what keeps the
// journal independent of the services' migration order.
func (r *PG) EnsureTriggers(ctx context.Context) (int, error) {
	var attached int
	if err := r.pool.QueryRow(ctx, `SELECT ensure_audit_triggers()`).Scan(&attached); err != nil {
		return 0, fmt.Errorf("storage.EnsureTriggers: %w", err)
	}
	return attached, nil
}
