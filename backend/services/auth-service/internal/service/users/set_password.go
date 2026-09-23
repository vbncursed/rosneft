package users

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/validate"
)

// SetPassword sets another user's password without asking for the old one and
// signs them out everywhere. An out-of-scope id reads as missing, as it does in
// every admin action. It does not call guard(): the last-admin rule stops the
// system from losing its admins, and a reset loses nobody. Only the
// admin-owner-only half applies. It also covers Root, because Root is marked by
// is_owner and not necessarily by the admin slug; without that, a users:read_all
// holder could take over Root.
func (s *Service) SetPassword(ctx context.Context, actorID string, scopeAll bool, id, plain string) error {
	target, err := s.ownership(ctx, actorID, scopeAll, id)
	if err != nil {
		return err
	}
	if actorID == id {
		return domain.ErrSelfTarget
	}
	if isAdmin(target) || target.IsOwner {
		actor, err := s.store.GetByID(ctx, actorID)
		if err != nil {
			return err
		}
		if !actor.IsOwner {
			return domain.ErrAdminOwnerOnly
		}
	}
	if err := validate.Password(plain); err != nil {
		return err
	}
	hash, err := password.Hash(plain)
	if err != nil {
		return fmt.Errorf("users.SetPassword: hash: %w", err)
	}
	if err := s.store.ChangePassword(ctx, id, hash); err != nil {
		return err
	}
	// The password has already changed. The failure is still returned so the
	// admin retries, and a retry sets the same password and signs out again.
	if err := s.sessions.DeleteUser(ctx, id); err != nil {
		return fmt.Errorf("users.SetPassword: sign out: %w", err)
	}
	return nil
}
