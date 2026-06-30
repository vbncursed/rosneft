package roles

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// assertMutable verifies the actor may change a role: system roles are immutable
// (defined by migrations), and a non-owner may only touch roles in its own group
// (a role from another group reads as not-found so its slug can't be probed).
func (s *Store) assertMutable(ctx context.Context, slug, scopeAdminID string, allAccess bool) error {
	r, err := s.Get(ctx, slug)
	if err != nil {
		return err
	}
	if r.IsSystem {
		return domain.ErrSystemRole
	}
	if !allAccess && r.OwnerAdminID != scopeAdminID {
		return domain.ErrRoleNotFound
	}
	return nil
}
