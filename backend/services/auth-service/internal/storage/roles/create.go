package roles

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Create inserts a non-system role with the given permission slugs, stamped
// with the creating group's owner_admin_id (empty = global, for Root).
func (s *Store) Create(ctx context.Context, r domain.Role) (domain.Role, error) {
	const q = `INSERT INTO roles (slug, title, is_system, owner_admin_id)
		VALUES ($1, $2, FALSE, NULLIF($3, '')::uuid) RETURNING id`
	var id string
	if err := s.pool.QueryRow(ctx, q, r.Slug, r.Title, r.OwnerAdminID).Scan(&id); err != nil {
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
