package session

import (
	"context"
	"errors"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// RegisterFail increments the failure counter, arming the lock TTL on first fail.
func (s *Store) RegisterFail(ctx context.Context, identifier string) error {
	n, err := s.rdb.Incr(ctx, failKey(identifier)).Result()
	if err != nil {
		return fmt.Errorf("session.RegisterFail: %w", err)
	}
	if n == 1 {
		s.rdb.Expire(ctx, failKey(identifier), s.lockTTL)
	}
	return nil
}

// IsLocked reports whether identifier has exceeded maxFails.
func (s *Store) IsLocked(ctx context.Context, identifier string) (bool, error) {
	n, err := s.rdb.Get(ctx, failKey(identifier)).Int()
	if errors.Is(err, redis.Nil) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("session.IsLocked: %w", err)
	}
	return n >= s.maxFails, nil
}

// ClearFails resets the counter after a successful login.
func (s *Store) ClearFails(ctx context.Context, identifier string) error {
	if err := s.rdb.Del(ctx, failKey(identifier)).Err(); err != nil {
		return fmt.Errorf("session.ClearFails: %w", err)
	}
	return nil
}
