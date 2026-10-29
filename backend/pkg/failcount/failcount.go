// Package failcount is the one Redis failure counter behind every login-style
// throttle (auth login, change-password, twofa verify).
package failcount

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// The increment and its TTL are one script, so a crash cannot leave a counter
// that never expires, and a key found without a TTL is re-armed. The TTL is
// armed once per window: later attempts do not extend a lock.
var take = redis.NewScript(`
local n = redis.call('INCR', KEYS[1])
if n == 1 or redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return n`)

// Take reserves one attempt on key and returns its ordinal within the window
// (1 for the first). Callers compare it to their budget AFTER incrementing, so
// concurrent attempts cannot all pass a check made before any of them counted.
func Take(ctx context.Context, rdb redis.Scripter, key string, window time.Duration) (int64, error) {
	n, err := take.Run(ctx, rdb, []string{key}, window.Milliseconds()).Int64()
	if err != nil {
		return 0, fmt.Errorf("failcount.Take: %w", err)
	}
	return n, nil
}

// Refund gives back one attempt that was reserved but was not a guess (the
// request failed for a reason other than a wrong credential). It never goes
// below zero and never recreates an expired key: a counter that already left
// its window has nothing to give back, and a bare DECR would mint a key
// without a TTL.
var refund = redis.NewScript(`
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
local n = redis.call('DECR', KEYS[1])
if n <= 0 then redis.call('DEL', KEYS[1]) end
return n`)

// Refund undoes one Take on key.
func Refund(ctx context.Context, rdb redis.Scripter, key string) error {
	if err := refund.Run(ctx, rdb, []string{key}).Err(); err != nil {
		return fmt.Errorf("failcount.Refund: %w", err)
	}
	return nil
}
