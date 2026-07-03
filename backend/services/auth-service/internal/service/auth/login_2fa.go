package auth

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// LoginVerify2FA consumes a challenge and a TOTP (or recovery) code, delegating
// the code check to twofa-service and issuing a session on success.
func (s *Service) LoginVerify2FA(ctx context.Context, challenge, code string) (string, error) {
	if challenge == "" || code == "" {
		return "", fmt.Errorf("auth.LoginVerify2FA: %w: challenge and code required", domain.ErrInvalidInput)
	}
	userID, err := s.sessions.TakePending(ctx, challenge)
	if err != nil {
		return "", err
	}
	ok, err := s.twofa.Verify(ctx, userID, code)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", domain.Err2FAInvalidCode
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return "", err
	}
	return s.issue(ctx, u)
}
