package users

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Update replaces the user's roles when roleSlugs is non-nil, enforcing the
// owner scope. Email/username edits are out of v1 scope (reserved in the proto).
func (s *Service) Update(ctx context.Context, actorID string, scopeAll bool, id string, roleSlugs []string, _, _ string) (domain.User, error) {
	if _, err := s.ownership(ctx, actorID, scopeAll, id); err != nil {
		return domain.User{}, err
	}
	if roleSlugs != nil {
		if err := s.assertCanGrant(ctx, actorID, roleSlugs); err != nil {
			return domain.User{}, err
		}
		return s.store.SetRoles(ctx, id, roleSlugs)
	}
	return s.store.GetByID(ctx, id)
}
