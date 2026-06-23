package users

import (
	"context"
	"fmt"
)

func (s *Store) roleSlugs(ctx context.Context, id string) ([]string, error) {
	const q = `SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id
		WHERE ur.user_id = $1 ORDER BY r.slug`
	return s.scanStrings(ctx, q, id)
}

// Permissions returns the distinct permission slugs across all of the user's roles.
func (s *Store) Permissions(ctx context.Context, id string) ([]string, error) {
	const q = `SELECT DISTINCT p.slug
		FROM user_roles ur
		JOIN role_permissions rp ON rp.role_id = ur.role_id
		JOIN permissions p ON p.id = rp.permission_id
		WHERE ur.user_id = $1 ORDER BY p.slug`
	return s.scanStrings(ctx, q, id)
}

func (s *Store) scanStrings(ctx context.Context, q, arg string) ([]string, error) {
	rows, err := s.pool.Query(ctx, q, arg)
	if err != nil {
		return nil, fmt.Errorf("users.scanStrings: %w", err)
	}
	defer rows.Close()
	out := make([]string, 0, 8)
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, fmt.Errorf("users.scanStrings: scan: %w", err)
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("users.scanStrings: rows: %w", err)
	}
	return out, nil
}
