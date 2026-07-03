package twofa

import (
	"context"
	"errors"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/totp"
)

// Setup provisions a pending secret (stored encrypted, not yet enabled).
// accountLabel is the user's name shown in the authenticator app.
func (s *Service) Setup(ctx context.Context, userID, accountLabel string) (string, string, error) {
	c, err := s.store.Get(ctx, userID)
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return "", "", err
	}
	if c.Enabled {
		return "", "", domain.Err2FAAlreadyEnabled
	}
	secretPlain, url, err := totp.Generate(s.issuer, accountLabel)
	if err != nil {
		return "", "", err
	}
	ct, err := s.cipher.Encrypt([]byte(secretPlain))
	if err != nil {
		return "", "", fmt.Errorf("twofa.Setup: encrypt: %w", err)
	}
	if err := s.store.Set(ctx, userID, false, ct); err != nil {
		return "", "", err
	}
	return secretPlain, url, nil
}
