//go:build integration

package ratelimit_test

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/testcontainers/testcontainers-go"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/ratelimit"
)

func redisClient(t *testing.T) *redis.Client {
	t.Helper()
	ctr, err := tcredis.Run(t.Context(), "redis:8.2")
	assert.NilError(t, err)
	t.Cleanup(func() { _ = testcontainers.TerminateContainer(ctr) })
	uri, err := ctr.ConnectionString(t.Context())
	assert.NilError(t, err)
	opts, err := redis.ParseURL(uri)
	assert.NilError(t, err)
	rdb := redis.NewClient(opts)
	t.Cleanup(func() { _ = rdb.Close() })
	return rdb
}

// failExpire makes EXPIRE/PEXPIRE fail, as a crash between two commands would.
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

// A counter without a TTL is a permanent lockout.
func TestTakeAttemptAlwaysArmsTTL(t *testing.T) {
	rdb := redisClient(t)
	rdb.AddHook(failExpire{})
	s := ratelimit.New(rdb, 5, 10*time.Minute)

	_, _ = s.TakeAttempt(t.Context(), "u1")

	ttl, err := rdb.TTL(t.Context(), "2fa_fails:u1").Result()
	assert.NilError(t, err)
	assert.Assert(t, ttl > 0, "counter has no TTL: %v", ttl)
}

// Exactly the budget is granted, however many guesses arrive at once.
func TestTakeAttemptGrantsExactlyTheBudgetConcurrently(t *testing.T) {
	s := ratelimit.New(redisClient(t), 5, time.Hour)

	var granted atomic.Int32
	var wg sync.WaitGroup
	start := make(chan struct{})
	for range 40 {
		wg.Go(func() {
			<-start
			if ok, err := s.TakeAttempt(t.Context(), "u1"); err == nil && ok {
				granted.Add(1)
			}
		})
	}
	close(start)
	wg.Wait()

	assert.Equal(t, granted.Load(), int32(5))
}
