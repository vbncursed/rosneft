package users

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Freeze sets status=frozen (owner scope + self/last-admin guards) and evicts
// the user's sessions.
func (s *Service) Freeze(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error) {
	if _, err := s.ownership(ctx, actorID, scopeAll, id); err != nil {
		return domain.User{}, err
	}
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

// Unfreeze returns a frozen account to active (owner scope).
func (s *Service) Unfreeze(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error) {
	if _, err := s.ownership(ctx, actorID, scopeAll, id); err != nil {
		return domain.User{}, err
	}
	return s.store.SetStatus(ctx, id, domain.StatusActive, nil)
}
