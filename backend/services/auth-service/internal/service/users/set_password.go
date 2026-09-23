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
// every admin action — and to anyone but Root, Root and every Company Owner are
// out of scope (see ownership), so a users:read_all holder cannot take over
// Root. It does not call guard(): the last-admin rule stops the system from
// losing its admins, and a reset loses nobody.
func (s *Service) SetPassword(ctx context.Context, actorID string, scopeAll bool, id, plain string) error {
	if _, err := s.ownership(ctx, actorID, scopeAll, id); err != nil {
		return err
	}
	if actorID == id {
		return domain.ErrSelfTarget
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
