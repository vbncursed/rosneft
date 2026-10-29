package auth

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
)

// VerifyPassword checks the caller's password without changing it. Used as the
// step-up factor for sensitive self-service actions (registering or deleting a
// passkey) when the user has no 2FA. Resolves the actor from the session token
// so the client cannot verify against another account.
//
// A stolen session could otherwise guess the password here at the general API
// rate and then enrol its own passkey, so every call draws on the same
// per-user budget as ChangePassword (TakeChangePasswordAttempt): a wrong or
// empty password stays counted, a failure that is ours is refunded, a right
// one clears the budget. Past the budget even the right password is refused.
func (s *Service) VerifyPassword(ctx context.Context, token, plain string) (bool, error) {
	if token == "" {
		return false, fmt.Errorf("auth.VerifyPassword: %w: token required", domain.ErrInvalidInput)
	}
	uid, _, _, _, _, _, err := s.ValidateToken(ctx, token)
	if err != nil {
		return false, err
	}
	allowed, err := s.sessions.TakeChangePasswordAttempt(ctx, uid)
	if err != nil {
		return false, err
	}
	if !allowed {
		return false, domain.ErrLoginThrottled
	}
	ok, err := s.checkPassword(ctx, uid, plain)
	if err != nil {
		_ = s.sessions.RefundChangePasswordAttempt(ctx, uid)
		return false, err
	}
	if ok {
		_ = s.sessions.ClearChangePasswordFails(ctx, uid)
	}
	return ok, nil
}

// checkPassword compares plain with the stored hash of a user.
func (s *Service) checkPassword(ctx context.Context, uid, plain string) (bool, error) {
	u, err := s.users.GetByID(ctx, uid)
	if err != nil {
		return false, err
	}
	ok, err := password.Verify(plain, u.PasswordHash)
	if err != nil {
		return false, fmt.Errorf("auth.VerifyPassword: %w", err)
	}
	return ok, nil
}
