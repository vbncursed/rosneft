package users

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// List returns users for the actor: all of them when the actor holds
// users:read_all (scopeAll), otherwise only the ones the actor created.
func (s *Service) List(ctx context.Context, actorID string, scopeAll bool, status string, includeDeleted bool) ([]domain.User, error) {
	ownerID := actorID
	if scopeAll {
		ownerID = ""
	}
	return s.store.List(ctx, status, includeDeleted, ownerID)
}
