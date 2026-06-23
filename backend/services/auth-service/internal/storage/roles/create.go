package roles

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Create inserts a non-system role with the given permission slugs.
func (s *Store) Create(ctx context.Context, r domain.Role) (domain.Role, error) {
	const q = `INSERT INTO roles (slug, title, is_system) VALUES ($1, $2, FALSE) RETURNING id`
	var id string
	if err := s.pool.QueryRow(ctx, q, r.Slug, r.Title).Scan(&id); err != nil {
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
