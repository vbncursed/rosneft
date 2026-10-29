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
