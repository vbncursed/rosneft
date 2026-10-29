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

// EnabledFor is the batch form of IsEnabled. The admin user list asks for N
// users at once; N round trips for N rows is the shape this exists to avoid.
func (s *Service) EnabledFor(ctx context.Context, userIDs []string) ([]string, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	return s.store.EnabledFor(ctx, userIDs)
}

// Verify checks a TOTP or one-time recovery code for a user with 2FA enabled.
// It is rate-limited per user: locked after too many fails, cleared on success.
func (s *Service) Verify(ctx context.Context, userID, code string) (bool, error) {
	allowed, err := s.limiter.TakeAttempt(ctx, userID)
	if err != nil {
		return false, err
	}
	if !allowed {
		return false, domain.ErrTwoFALocked
	}
	ok, err := s.check(ctx, userID, code)
	// A wrong code is (false, nil) and stays counted. Any error is ours (store,
	// cipher, recovery codes) or not a guess at all (2FA off): give the attempt back.
	if err != nil {
		_ = s.limiter.Refund(ctx, userID)
	}
	return ok, err
}

// check is Verify after its attempt has been reserved.
func (s *Service) check(ctx context.Context, userID, code string) (bool, error) {
	c, err := s.store.Get(ctx, userID)
	if err != nil {
		return false, err
	}
	if !c.Enabled {
		return false, domain.ErrTwoFANotEnabled
	}
	secretPlain, err := s.cipher.Decrypt(c.Secret)
	if err != nil {
		return false, err
	}
	fresh, err := s.acceptTOTP(ctx, userID, secretPlain, code)
	if err != nil {
		return false, err
	}
	if fresh {
		_ = s.limiter.Clear(ctx, userID)
		metricTwofaVerifications.WithLabelValues("succeeded").Inc()
		return true, nil
	}
	ids, hashes, err := s.recovery.List(ctx, userID)
	if err != nil {
		return false, err
	}
	if idx, ok := totp.MatchRecovery(code, hashes); ok {
		consumed, err := s.recovery.Consume(ctx, ids[idx])
		if err != nil {
			return false, err
		}
		if consumed {
			_ = s.limiter.Clear(ctx, userID)
			metricTwofaVerifications.WithLabelValues("succeeded").Inc()
			return true, nil
		}
	}
	metricTwofaVerifications.WithLabelValues("failed").Inc()
	return false, nil
}

// Status reports what the account screen shows: whether 2FA is on, when it
// went on, and how many recovery codes are left. An unenrolled or disabled
// user is "off" with no codes — not an error, and not a second query.
func (s *Service) Status(ctx context.Context, userID string) (domain.Status, error) {
	c, err := s.store.Get(ctx, userID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return domain.Status{}, nil
		}
		return domain.Status{}, err
	}
	if !c.Enabled {
		return domain.Status{}, nil
	}
	remaining, total, err := s.recovery.Counts(ctx, userID)
	if err != nil {
		return domain.Status{}, err
	}
	return domain.Status{
		Enabled:           true,
		EnabledAt:         c.EnabledAt,
		RecoveryRemaining: remaining,
		RecoveryTotal:     total,
	}, nil
}
