package auth

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/totp"
)

// LoginVerify2FA consumes a challenge and a TOTP (or recovery) code, issuing a
// session on success.
func (s *Service) LoginVerify2FA(ctx context.Context, challenge, code string) (string, error) {
	if challenge == "" || code == "" {
		return "", fmt.Errorf("auth.LoginVerify2FA: %w: challenge and code required", domain.ErrInvalidInput)
	}
	userID, err := s.sessions.TakePending(ctx, challenge)
	if err != nil {
		return "", err
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return "", err
	}
	secretPlain, err := s.cipher.Decrypt(u.TOTPSecret)
	if err != nil {
		return "", fmt.Errorf("auth.LoginVerify2FA: decrypt: %w", err)
	}
	if totp.Validate(string(secretPlain), code) {
		return s.issue(ctx, u)
	}
	// Fall back to one-time recovery codes.
	ids, hashes, err := s.recovery.List(ctx, userID)
	if err != nil {
		return "", err
	}
	if idx, ok := totp.MatchRecovery(code, hashes); ok {
		if err := s.recovery.MarkUsed(ctx, ids[idx]); err != nil {
			return "", err
		}
		return s.issue(ctx, u)
	}
	return "", domain.Err2FAInvalidCode
}
