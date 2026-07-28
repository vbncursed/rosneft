package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// List returns entries newest-first. Filters are appended only when set, so the
// planner can use audit_log_company_idx for a scoped read and audit_log_id_idx
// for the Root's.
func (r *PG) List(ctx context.Context, f domain.Filter) ([]domain.Entry, error) {
	q := `SELECT ` + entryColumns + ` FROM audit_log WHERE 1=1`
	args := make([]any, 0, 8)

	if !f.AllCompanies {
		args = append(args, f.CompanyID)
		q += fmt.Sprintf(" AND company_id = $%d", len(args))
	}
	if f.ActorID != "" {
		args = append(args, f.ActorID)
		q += fmt.Sprintf(" AND actor_id = $%d", len(args))
	}
	if f.Action != "" {
		args = append(args, f.Action)
		q += fmt.Sprintf(" AND action = $%d", len(args))
	}
	if f.Entity != "" {
		args = append(args, f.Entity)
		q += fmt.Sprintf(" AND entity = $%d", len(args))
	}
	if !f.From.IsZero() {
		args = append(args, f.From)
		q += fmt.Sprintf(" AND at >= $%d", len(args))
	}
	if !f.To.IsZero() {
		args = append(args, f.To)
		q += fmt.Sprintf(" AND at <= $%d", len(args))
	}
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
