// Package ratelimit throttles 2FA verify attempts per user in Redis. It mirrors
// auth-service's session login throttle (same failcount counter).
package ratelimit

import (
	"context"
	"fmt"
	"strconv"
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

// stepTTL outlives a code: one is accepted for 3 steps (±1 skew), 90 s.
const stepTTL = 2 * time.Minute

// claimStep advances the last accepted step only when the new one is later.
var claimStep = redis.NewScript(`
local cur = redis.call('GET', KEYS[1])
if cur and tonumber(cur) >= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 1`)

// ClaimStep records step as the user's last accepted TOTP step. It reports
// false when that step or a later one was already accepted: the code is a
// replay. The compare-and-advance is one script, so of any number of parallel
// submissions of one code exactly one gets true.
func (s *Store) ClaimStep(ctx context.Context, userID string, step int64) (bool, error) {
	n, err := claimStep.Run(ctx, s.rdb, []string{"2fa_step:" + userID},
		strconv.FormatInt(step, 10), int(stepTTL.Seconds())).Int()
	if err != nil {
		return false, fmt.Errorf("ratelimit.ClaimStep: %w", err)
	}
	return n == 1, nil
}
