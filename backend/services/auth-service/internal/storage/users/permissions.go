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

// roleSlugsByUsers hydrates role slugs for a batch of users in one query.
// List views show roles but skip the expensive per-user permission fan-out.
func (s *Store) roleSlugsByUsers(ctx context.Context, ids []string) (map[string][]string, error) {
	const q = `SELECT ur.user_id, r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id
		WHERE ur.user_id = ANY($1) ORDER BY r.slug`
	rows, err := s.pool.Query(ctx, q, ids)
	if err != nil {
		return nil, fmt.Errorf("users.roleSlugsByUsers: %w", err)
	}
	defer rows.Close()
	out := make(map[string][]string, len(ids))
	for rows.Next() {
		var uid, slug string
		if err := rows.Scan(&uid, &slug); err != nil {
			return nil, fmt.Errorf("users.roleSlugsByUsers: scan: %w", err)
		}
		out[uid] = append(out[uid], slug)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("users.roleSlugsByUsers: rows: %w", err)
	}
	return out, nil
}

// PermissionsForRoles returns the union of permission slugs conferred by the
// given role slugs — used to enforce no-privilege-escalation on role grants.
func (s *Store) PermissionsForRoles(ctx context.Context, roleSlugs []string) ([]string, error) {
	const q = `SELECT DISTINCT p.slug
		FROM roles r
		JOIN role_permissions rp ON rp.role_id = r.id
		JOIN permissions p ON p.id = rp.permission_id
		WHERE r.slug = ANY($1) ORDER BY p.slug`
	rows, err := s.pool.Query(ctx, q, roleSlugs)
	if err != nil {
		return nil, fmt.Errorf("users.PermissionsForRoles: %w", err)
	}
	defer rows.Close()
	out := make([]string, 0, 16)
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, fmt.Errorf("users.PermissionsForRoles: scan: %w", err)
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("users.PermissionsForRoles: rows: %w", err)
	}
	return out, nil
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
