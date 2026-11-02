package users

import (
	"context"
	"slices"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Update is a full replace of the user's role set, enforcing the owner scope.
// An empty set removes every role (an empty proto repeated arrives as nil, so we
// must not treat nil as "no change"); the Root flag is managed separately via
// SetOwner. Email/username edits are out of v1 scope (reserved in the proto).
func (s *Service) Update(
	ctx context.Context,
	actorID string,
	scopeAll bool,
	id string,
	roleSlugs []string,
	_, _ string,
) (domain.User, error) {
	target, err := s.ownership(ctx, actorID, scopeAll, id)
	if err != nil {
		return domain.User{}, err
	}
	if err := s.assertCanGrant(ctx, actorID, roleSlugs); err != nil {
		return domain.User{}, err
	}
	if !slices.Contains(roleSlugs, domain.RoleAdmin) {
		if err := s.assertNotLastAdmin(ctx, target); err != nil {
			return domain.User{}, err
		}
	}
	return s.store.SetRoles(ctx, actorID, id, roleSlugs)
}
