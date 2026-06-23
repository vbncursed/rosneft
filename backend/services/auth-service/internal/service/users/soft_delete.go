package users

import (
	"context"
	"time"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// SoftDelete marks the account deleted (guarded) and evicts its sessions.
func (s *Service) SoftDelete(ctx context.Context, actorID, id string) error {
	if err := s.guard(ctx, actorID, id); err != nil {
		return err
	}
	now := time.Now()
	if _, err := s.store.SetStatus(ctx, id, domain.StatusDeleted, &now); err != nil {
		return err
	}
	return s.sessions.DeleteUser(ctx, id)
}

// Restore reactivates a soft-deleted account.
func (s *Service) Restore(ctx context.Context, id string) (domain.User, error) {
	return s.store.SetStatus(ctx, id, domain.StatusActive, nil)
}
