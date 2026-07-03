package twofa

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/totp"
)

// Enable confirms the pending secret with a code, flips enabled on, and returns
// one-time recovery codes (shown once).
func (s *Service) Enable(ctx context.Context, userID, code string) ([]string, error) {
	c, err := s.store.Get(ctx, userID)
	if err != nil {
		return nil, err
	}
	if c.Enabled {
		return nil, domain.Err2FAAlreadyEnabled
	}
	if len(c.Secret) == 0 {
		return nil, fmt.Errorf("twofa.Enable: %w: run setup first", domain.Err2FANotEnabled)
	}
	secretPlain, err := s.cipher.Decrypt(c.Secret)
	if err != nil {
		return nil, fmt.Errorf("twofa.Enable: decrypt: %w", err)
	}
	if !totp.Validate(string(secretPlain), code) {
		return nil, domain.Err2FAInvalidCode
	}
	if err := s.store.Set(ctx, userID, true, c.Secret); err != nil {
		return nil, err
	}
	return s.issueRecovery(ctx, userID)
}

// issueRecovery generates + stores a fresh set, returning the plaintext once.
func (s *Service) issueRecovery(ctx context.Context, userID string) ([]string, error) {
	plain, hashes, err := totp.GenerateRecovery(recoveryCodeCount)
	if err != nil {
		return nil, err
	}
	if err := s.recovery.Replace(ctx, userID, hashes); err != nil {
		return nil, err
	}
	return plain, nil
}
