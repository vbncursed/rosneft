package twofa

import (
	"context"
	"errors"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/totp"
)

// IsEnabled reports whether the user has 2FA turned on. An unenrolled user
// (no row) is not enabled.
func (s *Service) IsEnabled(ctx context.Context, userID string) (bool, error) {
	c, err := s.store.Get(ctx, userID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return false, nil
		}
		return false, err
	}
	return c.Enabled, nil
}

// Verify checks a TOTP or one-time recovery code for a user with 2FA enabled.
// It is rate-limited per user: locked after too many fails, cleared on success.
func (s *Service) Verify(ctx context.Context, userID, code string) (bool, error) {
	locked, err := s.limiter.IsLocked(ctx, userID)
	if err != nil {
		return false, err
	}
	if locked {
		return false, domain.Err2FALocked
	}
	c, err := s.store.Get(ctx, userID)
	if err != nil {
		return false, err
	}
	if !c.Enabled {
		return false, domain.Err2FANotEnabled
	}
	secretPlain, err := s.cipher.Decrypt(c.Secret)
	if err != nil {
		return false, err
	}
	if totp.Validate(string(secretPlain), code) {
		_ = s.limiter.Clear(ctx, userID)
		metricTwofaVerifications.WithLabelValues("succeeded").Inc()
		return true, nil
	}
	ids, hashes, err := s.recovery.List(ctx, userID)
	if err != nil {
		return false, err
	}
	if idx, ok := totp.MatchRecovery(code, hashes); ok {
		if err := s.recovery.MarkUsed(ctx, ids[idx]); err != nil {
			return false, err
		}
		_ = s.limiter.Clear(ctx, userID)
		metricTwofaVerifications.WithLabelValues("succeeded").Inc()
		return true, nil
	}
	_ = s.limiter.RegisterFail(ctx, userID)
	metricTwofaVerifications.WithLabelValues("failed").Inc()
	return false, nil
}
