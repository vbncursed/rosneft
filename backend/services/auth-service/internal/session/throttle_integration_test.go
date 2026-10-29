//go:build integration

package session_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/redistest"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/session"
)

// failExpire makes EXPIRE/PEXPIRE fail, the way a crash or network error
// between two commands would leave a counter that was incremented but never
// armed with a TTL.
type failExpire struct{}

func (failExpire) DialHook(next redis.DialHook) redis.DialHook { return next }
func (failExpire) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		if n := cmd.Name(); n == "expire" || n == "pexpire" {
			return errors.New("injected: connection lost")
		}
		return next(ctx, cmd)
	}
}

func (failExpire) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return next
}

// A failure counter without a TTL is a permanent lockout: the account can
// never log in again. The TTL must come with the first increment, atomically.
func TestTakeAttemptAlwaysArmsTTL(t *testing.T) {
	rdb := redistest.Client(t)
	rdb.AddHook(failExpire{})
	s := session.New(rdb, time.Hour, time.Hour, time.Minute, 5, 10*time.Minute)

	_, _ = s.TakeAttempt(t.Context(), "ivan")

	ttl, err := rdb.TTL(t.Context(), "login_fail:ivan").Result()
	assert.NilError(t, err)
	assert.Assert(t, ttl > 0, "counter has no TTL: %v", ttl)
}
