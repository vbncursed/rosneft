package users

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// assertCanGrant enforces no-privilege-escalation on role assignment: a
// non-owner actor may only assign roles whose combined permissions are a subset
// of its own. The owner bypasses; an empty role set is always fine.
func (s *Service) assertCanGrant(ctx context.Context, actorID string, roleSlugs []string) error {
	if len(roleSlugs) == 0 {
		return nil
	}
	actor, err := s.store.GetByID(ctx, actorID)
	if err != nil {
		return err
	}
	if actor.IsOwner {
		return nil
	}
	granted, err := s.store.PermissionsForRoles(ctx, roleSlugs)
	if err != nil {
		return err
	}
	return domain.AssertGrantable(actor.Permissions, granted, actor.IsOwner)
}
