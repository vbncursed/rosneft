// Package ratelimit throttles 2FA verify attempts per user in Redis. It mirrors
// auth-service's session login throttle (same Incr/Expire/Get/Del shape).
package ratelimit

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
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

// IsLocked reports whether the user has reached the fail threshold.
func (s *Store) IsLocked(ctx context.Context, userID string) (bool, error) {
	n, err := s.rdb.Get(ctx, failKey(userID)).Int()
	if errors.Is(err, redis.Nil) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("ratelimit.IsLocked: %w", err)
	}
	return n >= s.maxFails, nil
}

// RegisterFail increments the failure counter, arming the lock TTL on first fail.
func (s *Store) RegisterFail(ctx context.Context, userID string) error {
	n, err := s.rdb.Incr(ctx, failKey(userID)).Result()
	if err != nil {
		return fmt.Errorf("ratelimit.RegisterFail: %w", err)
	}
	if n == 1 {
		s.rdb.Expire(ctx, failKey(userID), s.lockTTL)
	}
	return nil
}

// Clear resets the counter after a successful verify.
func (s *Store) Clear(ctx context.Context, userID string) error {
	if err := s.rdb.Del(ctx, failKey(userID)).Err(); err != nil {
		return fmt.Errorf("ratelimit.Clear: %w", err)
	}
	return nil
}
