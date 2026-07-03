package twofa

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/totp"
)

// Regenerate replaces the user's recovery codes after verifying a TOTP code.
func (s *Service) Regenerate(ctx context.Context, userID, code string) ([]string, error) {
	c, err := s.store.Get(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !c.Enabled {
		return nil, domain.Err2FANotEnabled
	}
	secretPlain, err := s.cipher.Decrypt(c.Secret)
	if err != nil {
		return nil, fmt.Errorf("twofa.Regenerate: decrypt: %w", err)
	}
	if !totp.Validate(string(secretPlain), code) {
		return nil, domain.Err2FAInvalidCode
	}
	return s.issueRecovery(ctx, userID)
}
