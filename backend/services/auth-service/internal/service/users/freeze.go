package users

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Freeze sets status=frozen (with guards) and evicts the user's sessions.
func (s *Service) Freeze(ctx context.Context, actorID, id string) (domain.User, error) {
	if err := s.guard(ctx, actorID, id); err != nil {
		return domain.User{}, err
	}
	u, err := s.store.SetStatus(ctx, id, domain.StatusFrozen, nil)
	if err != nil {
		return domain.User{}, err
	}
	if err := s.sessions.DeleteUser(ctx, id); err != nil {
		return domain.User{}, err
	}
	return u, nil
}

// Unfreeze returns a frozen account to active.
func (s *Service) Unfreeze(ctx context.Context, id string) (domain.User, error) {
	return s.store.SetStatus(ctx, id, domain.StatusActive, nil)
}
