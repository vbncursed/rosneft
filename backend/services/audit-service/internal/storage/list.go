package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// List returns entries newest-first. The filter predicates come from
// filterWhere, which List shares with Count; the index note lives there. Only
// the paging clauses are built here.
func (r *PG) List(ctx context.Context, f domain.Filter) ([]domain.Entry, error) {
	where, args := filterWhere(f)
	q := `SELECT ` + entryColumns + ` FROM audit_log` + where

	if f.Cursor > 0 {
		args = append(args, f.Cursor)
		q += fmt.Sprintf(" AND id < $%d", len(args))
	}
	args = append(args, f.Limit)
	q += fmt.Sprintf(" ORDER BY id DESC LIMIT $%d", len(args))

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("storage.List: %w", err)
	}
	defer rows.Close()

	out := make([]domain.Entry, 0, f.Limit)
	for rows.Next() {
		e, scanErr := scanEntry(rows)
		if scanErr != nil {
			return nil, fmt.Errorf("storage.List: scan: %w", scanErr)
		}
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.List: rows: %w", err)
	}
	return out, nil
}
