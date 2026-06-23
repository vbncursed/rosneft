package roles

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetPermissions replaces a role's permission set.
func (s *Store) SetPermissions(ctx context.Context, slug string, permSlugs []string) (domain.Role, error) {
	if _, err := s.Get(ctx, slug); err != nil {
		return domain.Role{}, err
	}
	if err := s.replacePermissions(ctx, slug, permSlugs); err != nil {
		return domain.Role{}, err
	}
	return s.Get(ctx, slug)
}

func (s *Store) replacePermissions(ctx context.Context, slug string, permSlugs []string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("roles.replacePermissions: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var roleID string
	if err := tx.QueryRow(ctx, `SELECT id FROM roles WHERE slug = $1`, slug).Scan(&roleID); err != nil {
		return fmt.Errorf("roles.replacePermissions: role id: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM role_permissions WHERE role_id = $1`, roleID); err != nil {
		return fmt.Errorf("roles.replacePermissions: clear: %w", err)
	}
	for _, ps := range permSlugs {
		var permID string
		if err := tx.QueryRow(ctx, `SELECT id FROM permissions WHERE slug = $1`, ps).Scan(&permID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.ErrPermissionUnknown
			}
			return fmt.Errorf("roles.replacePermissions: perm %q: %w", ps, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)`, roleID, permID); err != nil {
			return fmt.Errorf("roles.replacePermissions: insert: %w", err)
		}
	}
	return tx.Commit(ctx)
}
