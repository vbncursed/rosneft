package roles

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetPermissions replaces a role's permission set. scopeAdminID/allAccess scope
// the change to the actor's group (the store refuses other groups and system
// roles).
func (s *Service) SetPermissions(ctx context.Context, actorID, slug string, permSlugs []string, scopeAdminID string, allAccess bool) (domain.Role, error) {
	if slug == "" {
		return domain.Role{}, fmt.Errorf("roles.SetPermissions: %w: empty slug", domain.ErrInvalidInput)
	}
	if err := s.assertCanGrant(ctx, actorID, permSlugs); err != nil {
		return domain.Role{}, err
	}
	return s.store.SetPermissions(ctx, slug, permSlugs, scopeAdminID, allAccess)
}
