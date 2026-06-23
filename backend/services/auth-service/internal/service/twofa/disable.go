package twofa

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/totp"
)

// Disable verifies a current code then clears the secret and recovery codes.
func (s *Service) Disable(ctx context.Context, userID, code string) error {
	u, err := s.store.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if !u.TOTPEnabled {
		return domain.Err2FANotEnabled
	}
	secretPlain, err := s.cipher.Decrypt(u.TOTPSecret)
	if err != nil {
		return fmt.Errorf("twofa.Disable: decrypt: %w", err)
	}
	if !totp.Validate(string(secretPlain), code) {
		return domain.Err2FAInvalidCode
	}
	if err := s.store.SetTOTP(ctx, userID, false, nil); err != nil {
		return err
	}
	return s.recovery.DeleteAll(ctx, userID)
}
