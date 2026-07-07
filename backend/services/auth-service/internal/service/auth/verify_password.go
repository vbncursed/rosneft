package auth

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
)

// VerifyPassword checks the caller's password without changing it. Used as the
// step-up factor for sensitive self-service actions (e.g. deleting a passkey)
// when the user has no 2FA. Resolves the actor from the session token so the
// client cannot verify against another account.
func (s *Service) VerifyPassword(ctx context.Context, token, plain string) (bool, error) {
	if token == "" || plain == "" {
		return false, fmt.Errorf("auth.VerifyPassword: %w: token and password required", domain.ErrInvalidInput)
	}
	uid, _, _, _, err := s.ValidateToken(ctx, token)
	if err != nil {
		return false, err
	}
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
