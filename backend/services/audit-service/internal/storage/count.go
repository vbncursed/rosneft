package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// Count answers how many rows f matches, paging aside. Cursor and Limit are
// never read: the number a pager prints is "of everything", not "of the rest".
func (r *PG) Count(ctx context.Context, f domain.Filter) (int64, error) {
	where, args := filterWhere(f)
	var n int64
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM audit_log`+where, args...).Scan(&n); err != nil {
		return 0, fmt.Errorf("storage.Count: %w", err)
	}
	return n, nil
}
