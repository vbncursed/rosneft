package users

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/validate"
)

// ChangePassword verifies the old password, stores the new hash and signs the
// user out everywhere except keepToken, the session that made the change:
// whoever else held a session may have learned the old password. If the
// sign-out fails the password has still changed and the error is returned, so
// the user retries and the retry signs out again. Failed
// attempts are throttled the same way Login throttles them, through
// dedicated Sessions methods keyed by userID under their own Redis
// namespace — see the Sessions interface doc for why reusing Login's
// TakeAttempt/ClearFails would not be safe here: Login's
// identifier reaches its throttle key with no validation, so it could be
// crafted to alias any string derived from a userID.
func (s *Service) ChangePassword(ctx context.Context, userID, keepToken, oldPlain, newPlain string) error {
	if err := validate.Password(newPlain); err != nil {
		return err
	}
	allowed, err := s.sessions.TakeChangePasswordAttempt(ctx, userID)
	if err != nil {
		return err
	}
	if !allowed {
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
		return domain.ErrInvalidCredential
	}
	hash, err := password.Hash(newPlain)
	if err != nil {
		return fmt.Errorf("users.ChangePassword: hash: %w", err)
	}
	if err := s.store.ChangePassword(ctx, userID, hash); err != nil {
		return err
	}
	_ = s.sessions.ClearChangePasswordFails(ctx, userID)
	if err := s.sessions.DeleteUserExcept(ctx, userID, keepToken); err != nil {
		return fmt.Errorf("users.ChangePassword: sign out others: %w", err)
	}
	return nil
}
