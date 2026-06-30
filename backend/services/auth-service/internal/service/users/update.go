package users

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Update is a full replace of the user's role set, enforcing the owner scope.
// An empty set removes every role (an empty proto repeated arrives as nil, so we
// must not treat nil as "no change"); the Root flag is managed separately via
// SetOwner. Email/username edits are out of v1 scope (reserved in the proto).
func (s *Service) Update(ctx context.Context, actorID string, scopeAll bool, id string, roleSlugs []string, _, _ string) (domain.User, error) {
	if _, err := s.ownership(ctx, actorID, scopeAll, id); err != nil {
		return domain.User{}, err
	}
	if err := s.assertCanGrant(ctx, actorID, roleSlugs); err != nil {
		return domain.User{}, err
	}
	return s.store.SetRoles(ctx, id, roleSlugs)
}
