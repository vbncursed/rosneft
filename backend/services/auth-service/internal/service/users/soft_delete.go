package users

import (
	"context"
	"time"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SoftDelete marks the account deleted (owner scope + self/last-admin guards)
// and evicts its sessions.
func (s *Service) SoftDelete(ctx context.Context, actorID string, scopeAll bool, id string) error {
	if _, err := s.ownership(ctx, actorID, scopeAll, id); err != nil {
		return err
	}
	if err := s.guard(ctx, actorID, id); err != nil {
		return err
	}
	now := time.Now()
	if _, err := s.store.SetStatus(ctx, id, domain.StatusDeleted, &now); err != nil {
		return err
	}
	return s.sessions.DeleteUser(ctx, id)
}

// Restore reactivates a soft-deleted account (owner scope).
func (s *Service) Restore(ctx context.Context, actorID string, scopeAll bool, id string) (domain.User, error) {
	if _, err := s.ownership(ctx, actorID, scopeAll, id); err != nil {
		return domain.User{}, err
	}
	return s.store.SetStatus(ctx, id, domain.StatusActive, nil)
}
