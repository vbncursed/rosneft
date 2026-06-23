package twofa

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/totp"
)

const recoveryCodeCount = 10

// Enable confirms the pending secret with a code, flips the flag on, and
// returns one-time recovery codes (shown once).
func (s *Service) Enable(ctx context.Context, userID, code string) ([]string, error) {
	u, err := s.store.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if u.TOTPEnabled {
		return nil, domain.Err2FAAlreadyEnabled
	}
	if len(u.TOTPSecret) == 0 {
		return nil, fmt.Errorf("twofa.Enable: %w: run setup first", domain.Err2FANotEnabled)
	}
	secretPlain, err := s.cipher.Decrypt(u.TOTPSecret)
	if err != nil {
		return nil, fmt.Errorf("twofa.Enable: decrypt: %w", err)
	}
	if !totp.Validate(string(secretPlain), code) {
		return nil, domain.Err2FAInvalidCode
	}
	if err := s.store.SetTOTP(ctx, userID, true, u.TOTPSecret); err != nil {
		return nil, err
	}
	plain, hashes, err := totp.GenerateRecovery(recoveryCodeCount)
	if err != nil {
		return nil, err
	}
	if err := s.recovery.Replace(ctx, userID, hashes); err != nil {
		return nil, err
	}
	return plain, nil
}
