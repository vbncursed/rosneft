package session

import (
	"context"
	"errors"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// RegisterChangePasswordFail increments ChangePassword's failure counter,
// arming the lock TTL on first fail. Keyed by changePasswordFailKey, a
// distinct top-level namespace from Login's failKey — see store.go.
func (s *Store) RegisterChangePasswordFail(ctx context.Context, userID string) error {
	key := changePasswordFailKey(userID)
	n, err := s.rdb.Incr(ctx, key).Result()
	if err != nil {
		return fmt.Errorf("session.RegisterChangePasswordFail: %w", err)
	}
	if n == 1 {
		s.rdb.Expire(ctx, key, s.lockTTL)
	}
	return nil
}

// IsChangePasswordLocked reports whether userID has exceeded maxFails on
// change-password attempts.
func (s *Store) IsChangePasswordLocked(ctx context.Context, userID string) (bool, error) {
	n, err := s.rdb.Get(ctx, changePasswordFailKey(userID)).Int()
	if errors.Is(err, redis.Nil) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("session.IsChangePasswordLocked: %w", err)
	}
	return n >= s.maxFails, nil
}

// ClearChangePasswordFails resets the counter after a successful password change.
func (s *Store) ClearChangePasswordFails(ctx context.Context, userID string) error {
	if err := s.rdb.Del(ctx, changePasswordFailKey(userID)).Err(); err != nil {
		return fmt.Errorf("session.ClearChangePasswordFails: %w", err)
	}
	return nil
}
