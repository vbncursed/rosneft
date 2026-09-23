package users

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// List returns users for the actor: all of them when the actor holds
// users:read_all (scopeAll), otherwise only the ones the actor created, plus
// the actor's own account. Either way, only Root sees Root and the Company
// Owners (the admin slug); everyone else keeps just their own row of those.
func (s *Service) List(ctx context.Context, actorID string, scopeAll bool, status string, includeDeleted bool) ([]domain.User, error) {
	actor, err := s.store.GetByID(ctx, actorID)
	if err != nil {
		return nil, err
	}
	ownerID, hidePrivilegedExcept := actorID, actorID
	if scopeAll {
		ownerID = ""
	}
	if actor.IsOwner {
		hidePrivilegedExcept = ""
	}
	return s.store.List(ctx, status, includeDeleted, ownerID, hidePrivilegedExcept)
}
