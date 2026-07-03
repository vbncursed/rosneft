package twofa

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/totp"
)

// Disable verifies a current code then clears the secret and recovery codes.
func (s *Service) Disable(ctx context.Context, userID, code string) error {
	c, err := s.store.Get(ctx, userID)
	if err != nil {
		return err
	}
	if !c.Enabled {
		return domain.Err2FANotEnabled
	}
	secretPlain, err := s.cipher.Decrypt(c.Secret)
	if err != nil {
		return fmt.Errorf("twofa.Disable: decrypt: %w", err)
	}
	if !totp.Validate(string(secretPlain), code) {
		return domain.Err2FAInvalidCode
	}
	if err := s.store.Set(ctx, userID, false, nil); err != nil {
		return err
	}
	return s.recovery.DeleteAll(ctx, userID)
}
