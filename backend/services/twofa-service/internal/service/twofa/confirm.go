package twofa

import (
	"context"
	"errors"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/totp"
)

// confirmTOTP is the code check behind Disable and Regenerate. It shares
// Verify's per-user limiter, so a stolen cookie cannot guess codes here
// without also burning the login budget.
func (s *Service) confirmTOTP(ctx context.Context, userID, code string) error {
	allowed, err := s.limiter.TakeAttempt(ctx, userID)
	if err != nil {
		return err
	}
	if !allowed {
		return domain.ErrTwoFALocked
	}
	err = s.confirm(ctx, userID, code)
	// Only a wrong code is a guess; every other failure gives the attempt back.
	if err != nil && !errors.Is(err, domain.ErrTwoFAInvalidCode) {
		_ = s.limiter.Refund(ctx, userID)
	}
	return err
}

// confirm is confirmTOTP after its attempt has been reserved.
func (s *Service) confirm(ctx context.Context, userID, code string) error {
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
	if ok, err := s.acceptTOTP(ctx, userID, secretPlain, code); err != nil {
		return err
	} else if !ok {
		return domain.ErrTwoFAInvalidCode
	}
	_ = s.limiter.Clear(ctx, userID)
	return nil
}

// acceptTOTP is true for a valid code whose time step was not accepted before,
// and records the step so the same code cannot be used twice.
func (s *Service) acceptTOTP(ctx context.Context, userID string, secret []byte, code string) (bool, error) {
	step, ok := totp.Validate(string(secret), code)
	if !ok {
		return false, nil
	}
	return s.limiter.ClaimStep(ctx, userID, step)
}
