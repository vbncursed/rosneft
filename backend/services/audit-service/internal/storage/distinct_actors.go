package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// DistinctActors returns every actor that appears in the caller's slice of the
// journal, newest activity first.
//
// It exists so the actor filter can offer the whole scope rather than whoever
// happens to be on the page already loaded. Only the tenant filter applies: the
// other filters narrow what the reader is looking at, and a dropdown that shrank
// as you used it would be a puzzle, not a help.
//
// A NULL actor — a system change — is excluded: it is not a person, and the
// filter contract has no way to ask for one anyway (an empty actor means "no
// filter").
func (r *PG) DistinctActors(ctx context.Context, f domain.Filter) ([]string, error) {
	q := `SELECT actor_id::text FROM audit_log WHERE actor_id IS NOT NULL`
	args := make([]any, 0, 1)
	if !f.AllCompanies {
		args = append(args, f.CompanyID)
		q += fmt.Sprintf(" AND company_id = $%d", len(args))
	}
	q += ` GROUP BY actor_id ORDER BY max(id) DESC`

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("storage.DistinctActors: %w", err)
	}
	defer rows.Close()

	out := make([]string, 0, 16)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("storage.DistinctActors: scan: %w", err)
		}
		out = append(out, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.DistinctActors: rows: %w", err)
	}
	return out, nil
}
