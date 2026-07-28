package roles

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Create inserts a non-system role with the given permission slugs, stamped
// with the creating group's owner_admin_id (empty = global, for Root).
//
// Wrapped in audittx.Run so the audit trigger can attribute the insert;
// replacePermissions runs its own audited transaction for the role_permissions
// rows, as it already did.
func (s *Store) Create(ctx context.Context, r domain.Role) (domain.Role, error) {
	const q = `INSERT INTO roles (slug, title, is_system, owner_admin_id)
		VALUES ($1, $2, FALSE, NULLIF($3, '')::uuid) RETURNING id`

	err := audittx.Run(ctx, s.pool, func(tx pgx.Tx) error {
		var id string
		return tx.QueryRow(ctx, q, r.Slug, r.Title, r.OwnerAdminID).Scan(&id)
	})
	if err != nil {
		if isUnique(err) {
			return domain.Role{}, domain.ErrRoleSlugTaken
		}
		return domain.Role{}, fmt.Errorf("roles.Create: %w", err)
	}
	if err := s.replacePermissions(ctx, r.Slug, r.PermissionSlugs); err != nil {
		return domain.Role{}, err
	}
	return s.Get(ctx, r.Slug)
}
