package twofa

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/totp"
)

// Setup provisions a pending secret (stored encrypted, not yet enabled).
func (s *Service) Setup(ctx context.Context, userID string) (string, string, error) {
	u, err := s.store.GetByID(ctx, userID)
	if err != nil {
		return "", "", err
	}
	if u.TOTPEnabled {
		return "", "", domain.Err2FAAlreadyEnabled
	}
	secretPlain, url, err := totp.Generate(s.issuer, u.Username)
	if err != nil {
		return "", "", err
	}
	ct, err := s.cipher.Encrypt([]byte(secretPlain))
	if err != nil {
		return "", "", fmt.Errorf("twofa.Setup: encrypt: %w", err)
	}
	if err := s.store.SetTOTP(ctx, userID, false, ct); err != nil {
		return "", "", err
	}
	return secretPlain, url, nil
}
