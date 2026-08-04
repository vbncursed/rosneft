package users

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/validate"
)

// ChangePassword verifies the old password then stores the new hash. Failed
// attempts are throttled the same way Login throttles them, through
// dedicated Sessions methods keyed by userID under their own Redis
// namespace — see the Sessions interface doc for why reusing Login's
// IsLocked/RegisterFail/ClearFails would not be safe here: Login's
// identifier reaches its throttle key with no validation, so it could be
// crafted to alias any string derived from a userID.
func (s *Service) ChangePassword(ctx context.Context, userID, oldPlain, newPlain string) error {
	if err := validate.Password(newPlain); err != nil {
		return err
	}
	locked, err := s.sessions.IsChangePasswordLocked(ctx, userID)
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
		_ = s.sessions.RegisterChangePasswordFail(ctx, userID)
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
	return nil
}
