package users

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// List returns users filtered by status (empty = any) and, unless
// includeDeleted, hides soft-deleted rows. Roles/permissions are NOT hydrated
// here (list views don't need the per-user permission fan-out).
func (s *Store) List(ctx context.Context, status string, includeDeleted bool, ownerID string) ([]domain.User, error) {
	q := `SELECT ` + userColumns + ` FROM users u WHERE 1=1`
	args := make([]any, 0, 3)
	if ownerID != "" {
		args = append(args, ownerID)
		q += fmt.Sprintf(" AND u.created_by = $%d", len(args))
	}
	if status != "" {
		args = append(args, status)
		q += fmt.Sprintf(" AND u.status = $%d", len(args))
	} else if !includeDeleted {
		q += " AND u.status <> 'deleted'"
	}
	q += " ORDER BY u.created_at"

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("users.List: %w", err)
	}
	defer rows.Close()
	out := make([]domain.User, 0, 16)
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, fmt.Errorf("users.List: scan: %w", err)
		}
		out = append(out, u)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("users.List: rows: %w", err)
	}
	if len(out) == 0 {
		return out, nil
	}
	ids := make([]string, len(out))
	for i := range out {
		ids[i] = out[i].ID
	}
	byUser, err := s.roleSlugsByUsers(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("users.List: roles: %w", err)
	}
	for i := range out {
		out[i].RoleSlugs = byUser[out[i].ID]
	}
	return out, nil
}
