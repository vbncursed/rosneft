package roles

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// List returns roles visible to the caller: global roles (system + Root-created,
// owner_admin_id IS NULL) plus, for a non-owner, the roles of its own group.
// allAccess (Root) sees every role.
func (s *Store) List(ctx context.Context, scopeAdminID string, allAccess bool) ([]domain.Role, error) {
	const q = `SELECT slug FROM roles
		WHERE owner_admin_id IS NULL OR $2 OR owner_admin_id = NULLIF($1, '')::uuid
		ORDER BY slug`
	rows, err := s.pool.Query(ctx, q, scopeAdminID, allAccess)
	if err != nil {
		return nil, fmt.Errorf("roles.List: %w", err)
	}
	slugs := make([]string, 0, 8)
	for rows.Next() {
		var slug string
		if err := rows.Scan(&slug); err != nil {
			rows.Close()
			return nil, fmt.Errorf("roles.List: scan: %w", err)
		}
		slugs = append(slugs, slug)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("roles.List: rows: %w", err)
	}
	out := make([]domain.Role, 0, len(slugs))
	for _, slug := range slugs {
		r, err := s.Get(ctx, slug)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, nil
}
