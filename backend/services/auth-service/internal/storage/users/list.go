package users

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// List returns users filtered by status (empty = any) and, unless
// includeDeleted, hides soft-deleted rows. A non-empty ownerID keeps only the
// users it created plus its own row. A non-empty hidePrivilegedExcept drops
// Root (is_owner) and every admin-role holder except that id's own row — only
// Root may see them. Roles/permissions are NOT hydrated here (list views don't
// need the per-user permission fan-out).
func (s *Store) List(
	ctx context.Context, status string, includeDeleted bool, ownerID, hidePrivilegedExcept string,
) ([]domain.User, error) {
	q, args := listQuery(status, includeDeleted, ownerID, hidePrivilegedExcept)
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("users.List: %w", err)
	}
	defer rows.Close()
	out, err := scanUsers(rows)
	if err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return out, nil
	}
	ids := make([]string, len(out))
	for i := range out {
		ids[i] = out[i].ID
	}
	byUser, titlesByUser, err := s.roleSlugsByUsers(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("users.List: roles: %w", err)
	}
	for i := range out {
		out[i].RoleSlugs = byUser[out[i].ID]
		out[i].RoleTitles = titlesByUser[out[i].ID]
	}
	return out, nil
}

// scanUsers reads every row into a user; roles are filled in by the caller.
func scanUsers(rows pgx.Rows) ([]domain.User, error) {
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
	return out, nil
}
