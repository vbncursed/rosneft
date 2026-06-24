package users

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SetOwner grants or revokes the owner flag. Only an existing owner may do it,
// and never on themselves (an owner cannot self-revoke and lock the role out).
func (s *Service) SetOwner(ctx context.Context, actorID, id string, isOwner bool) (domain.User, error) {
	if actorID == id {
		return domain.User{}, domain.ErrSelfTarget
	}
	actor, err := s.store.GetByID(ctx, actorID)
	if err != nil {
		return domain.User{}, err
	}
	if !actor.IsOwner {
		return domain.User{}, domain.ErrOwnerOnly
	}
	if _, err := s.store.GetByID(ctx, id); err != nil {
		return domain.User{}, err
	}
	return s.store.SetOwner(ctx, id, isOwner)
}
