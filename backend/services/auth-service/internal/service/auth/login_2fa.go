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
	userID, epoch, err := s.sessions.TakePending(ctx, challenge)
	if err != nil {
		return "", err
	}
	ok, err := s.twofa.Verify(ctx, userID, code)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", domain.ErrTwoFAInvalidCode
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return "", err
	}
	// The password this challenge was issued under is gone: Login's first step
	// read the row before the change, and issue() would stamp the new epoch.
	// epoch 0 is a challenge from before epochs were recorded: unchecked.
	if epoch != 0 && u.PasswordEpoch() != epoch {
		return "", domain.ErrTwoFAInvalidCode
	}
	if err := checkActive(u); err != nil {
		return "", err
	}
	return s.issue(ctx, u)
}
