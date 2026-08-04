package users

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/validate"
)

// changePasswordLockKey namespaces the throttle counter under the userID so it
// can never alias a Login identifier (email or username): a stolen session
// can only lock the attacker's own change-password attempts out of this
// namespace, never the victim out of logging in.
func changePasswordLockKey(userID string) string {
	return "changepw:" + userID
}

// ChangePassword verifies the old password then stores the new hash. Failed
// attempts are throttled the same way Login throttles them, keyed by userID
// rather than identifier — see changePasswordLockKey.
func (s *Service) ChangePassword(ctx context.Context, userID, oldPlain, newPlain string) error {
	if err := validate.Password(newPlain); err != nil {
		return err
	}
	lockKey := changePasswordLockKey(userID)
	locked, err := s.sessions.IsLocked(ctx, lockKey)
	if err != nil {
		return err
	}
	if locked {
		return domain.ErrLoginThrottled
	}
	u, err := s.store.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	ok, err := password.Verify(oldPlain, u.PasswordHash)
	if err != nil {
		return fmt.Errorf("users.ChangePassword: verify: %w", err)
	}
	if !ok {
		_ = s.sessions.RegisterFail(ctx, lockKey)
		return domain.ErrInvalidCredential
	}
	hash, err := password.Hash(newPlain)
	if err != nil {
		return fmt.Errorf("users.ChangePassword: hash: %w", err)
	}
	if err := s.store.ChangePassword(ctx, userID, hash); err != nil {
		return err
	}
	_ = s.sessions.ClearFails(ctx, lockKey)
	return nil
}
