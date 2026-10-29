package session

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/pkg/failcount"
)

// TakeChangePasswordAttempt reserves one ChangePassword attempt and reports
// whether it is within the budget (see TakeAttempt). Keyed by
// changePasswordFailKey, a distinct top-level namespace from Login's failKey —
// see store.go.
func (s *Store) TakeChangePasswordAttempt(ctx context.Context, userID string) (bool, error) {
	n, err := failcount.Take(ctx, s.rdb, changePasswordFailKey(userID), s.lockTTL)
	if err != nil {
		return false, fmt.Errorf("session.TakeChangePasswordAttempt: %w", err)
	}
	return n <= int64(s.maxFails), nil
}

// ClearChangePasswordFails resets the counter after a successful password change.
func (s *Store) ClearChangePasswordFails(ctx context.Context, userID string) error {
	if err := s.rdb.Del(ctx, changePasswordFailKey(userID)).Err(); err != nil {
		return fmt.Errorf("session.ClearChangePasswordFails: %w", err)
	}
	return nil
}
