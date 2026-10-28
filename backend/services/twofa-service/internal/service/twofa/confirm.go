package twofa

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/totp"
)

// confirmTOTP is the code check behind Disable and Regenerate. It shares
// Verify's per-user limiter, so a stolen cookie cannot guess codes here
// without also burning the login budget.
func (s *Service) confirmTOTP(ctx context.Context, userID, code string) error {
	locked, err := s.limiter.IsLocked(ctx, userID)
	if err != nil {
		return err
	}
	if locked {
		return domain.ErrTwoFALocked
	}
	c, err := s.store.Get(ctx, userID)
	if err != nil {
		return err
	}
	if !c.Enabled {
		return domain.ErrTwoFANotEnabled
	}
	secretPlain, err := s.cipher.Decrypt(c.Secret)
	if err != nil {
		return fmt.Errorf("twofa.confirmTOTP: decrypt: %w", err)
	}
	if !totp.Validate(string(secretPlain), code) {
		_ = s.limiter.RegisterFail(ctx, userID)
		return domain.ErrTwoFAInvalidCode
	}
	_ = s.limiter.Clear(ctx, userID)
	return nil
}
