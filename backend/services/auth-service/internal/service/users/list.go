package users

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// List returns users for the actor: all of them when the actor holds
// users:read_all (scopeAll), otherwise only the ones the actor created, plus
// the actor's own account. Either way, only Root (isOwner) sees Root and the
// Company Owners (the admin slug); everyone else keeps just their own row of
// those. isOwner comes from the session the transport already validated, so
// the list costs no lookup of the actor.
func (s *Service) List(
	ctx context.Context, actorID string, isOwner, scopeAll bool, status string, includeDeleted bool,
) ([]domain.User, error) {
	ownerID, hidePrivilegedExcept := actorID, actorID
	if scopeAll {
		ownerID = ""
	}
	if isOwner {
		hidePrivilegedExcept = ""
	}
	return s.store.List(ctx, status, includeDeleted, ownerID, hidePrivilegedExcept)
}
