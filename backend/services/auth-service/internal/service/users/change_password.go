package users

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/validate"
)

// ChangePassword verifies the old password, stores the new hash and ends every
// other session of the user: whoever else held one may have learned the old
// password. The boundary is the password epoch, not the deletion: the session
// that makes the change is moved to the new epoch first, the new
// password_changed_at then outdates every other session (ValidateToken refuses
// them), including one a concurrent Login with the old password mints after
// this returns. DeleteUserExcept only removes the dead keys, so its failure is
// logged and the change still succeeds; failing the request would make a retry
// useless anyway, as the old password no longer verifies. Failed
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
	err = s.change(ctx, userID, keepToken, oldPlain, newPlain)
	// Only a wrong old password is a guess; a lookup, hash or store failure is
	// ours and must not burn the user's budget.
	if err != nil && !errors.Is(err, domain.ErrInvalidCredential) {
		_ = s.sessions.RefundChangePasswordAttempt(ctx, userID)
	}
	return err
}

// change is ChangePassword after its attempt has been reserved.
func (s *Service) change(ctx context.Context, userID, keepToken, oldPlain, newPlain string) error {
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
	at := nextChangeTime(u, time.Now())
	// Before the row changes, so the caller's own session is never between
	// epochs. If the store then fails, the session is merely ahead of the row.
	if err := s.sessions.SetPasswordEpoch(ctx, keepToken, at.UnixMicro()); err != nil {
		return fmt.Errorf("users.ChangePassword: keep session: %w", err)
	}
	if err := s.store.ChangePassword(ctx, userID, hash, at); err != nil {
		return err
	}
	s.passwordChanged(userID)
	_ = s.sessions.ClearChangePasswordFails(ctx, userID)
	if err := s.sessions.DeleteUserExcept(ctx, userID, keepToken); err != nil {
		slog.Warn("users.ChangePassword: sign out others failed; the epoch still refuses them",
			"user_id", userID, "error", err)
	}
	return nil
}
