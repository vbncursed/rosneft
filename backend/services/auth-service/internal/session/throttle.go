package session

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/pkg/failcount"
)

// TakeAttempt reserves one login attempt for identifier and reports whether it
// is within the budget. The count is taken before the password is checked, so
// concurrent guesses cannot all slip past a check made before any was counted;
// a successful login gives the budget back through ClearFails.
func (s *Store) TakeAttempt(ctx context.Context, identifier string) (bool, error) {
	n, err := failcount.Take(ctx, s.rdb, failKey(identifier), s.lockTTL)
	if err != nil {
		return false, fmt.Errorf("session.TakeAttempt: %w", err)
	}
	return n <= int64(s.maxFails), nil
}

// RefundAttempt gives back an attempt TakeAttempt reserved for a request that
// failed without the password being wrong (it was not a guess).
func (s *Store) RefundAttempt(ctx context.Context, identifier string) error {
	return failcount.Refund(ctx, s.rdb, failKey(identifier))
}

// ClearFails resets the counter after a successful login.
func (s *Store) ClearFails(ctx context.Context, identifier string) error {
	if err := s.rdb.Del(ctx, failKey(identifier)).Err(); err != nil {
		return fmt.Errorf("session.ClearFails: %w", err)
	}
	return nil
}
