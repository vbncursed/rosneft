// Package ratelimit throttles 2FA verify attempts per user in Redis. It mirrors
// auth-service's session login throttle (same failcount counter).
package ratelimit

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/pkg/failcount"
)

type Store struct {
	rdb      *redis.Client
	maxFails int
	lockTTL  time.Duration
}

func New(rdb *redis.Client, maxFails int, lockTTL time.Duration) *Store {
	return &Store{rdb: rdb, maxFails: maxFails, lockTTL: lockTTL}
}

func failKey(userID string) string { return "2fa_fails:" + userID }

// TakeAttempt reserves one verify attempt and reports whether it is within the
// budget. The attempt is counted before the code is checked, so concurrent
// guesses cannot all pass a check made before any of them was counted; a
// successful verify gives the budget back through Clear.
func (s *Store) TakeAttempt(ctx context.Context, userID string) (bool, error) {
	n, err := failcount.Take(ctx, s.rdb, failKey(userID), s.lockTTL)
	if err != nil {
		return false, fmt.Errorf("ratelimit.TakeAttempt: %w", err)
	}
	return n <= int64(s.maxFails), nil
}

// Refund gives back an attempt TakeAttempt reserved for a request that failed
// without the code being wrong (it was not a guess).
func (s *Store) Refund(ctx context.Context, userID string) error {
	return failcount.Refund(ctx, s.rdb, failKey(userID))
}

// Clear resets the counter after a successful verify.
func (s *Store) Clear(ctx context.Context, userID string) error {
	if err := s.rdb.Del(ctx, failKey(userID)).Err(); err != nil {
		return fmt.Errorf("ratelimit.Clear: %w", err)
	}
	return nil
}
