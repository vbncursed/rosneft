package roles

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Update renames a role and, when u.ReplacePermissions is set, rewrites its
// permission set in the same transaction: the Roles screen saves both at once,
// and a refused grant must not leave the rename standing. Refused for system
// roles and for roles outside the actor's group (see assertMutable). Wrapped
// in audittx.Run so both changes are attributed.
func (s *Store) Update(ctx context.Context, u domain.RoleUpdate, scopeAdminID string, allAccess bool) (domain.Role, error) {
	if err := s.assertMutable(ctx, u.Slug, scopeAdminID, allAccess); err != nil {
		return domain.Role{}, err
	}
	const q = `UPDATE roles SET title = $2, updated_at = now() WHERE slug = $1 RETURNING id`

	err := audittx.Run(ctx, s.pool, func(tx pgx.Tx) error {
		var roleID string
		if err := tx.QueryRow(ctx, q, u.Slug, u.Title).Scan(&roleID); err != nil {
			return err
		}
		if !u.ReplacePermissions {
			return nil
		}
		return writePermissions(ctx, tx, roleID, u.PermissionSlugs)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Role{}, domain.ErrRoleNotFound
	}
	if err != nil {
		return domain.Role{}, fmt.Errorf("roles.Update: %w", err)
	}
	return s.Get(ctx, u.Slug)
}
