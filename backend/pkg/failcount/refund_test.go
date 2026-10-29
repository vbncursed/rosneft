package failcount_test

import (
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/failcount"
)

func newRedis(t *testing.T) (*redis.Client, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	return rdb, mr
}

// A refunded attempt is not counted again: take 3, give back 1, the next take
// is the 3rd, not the 4th.
func TestRefundGivesBackOneAttempt(t *testing.T) {
	ctx := t.Context()
	rdb, _ := newRedis(t)
	for range 3 {
		_, err := failcount.Take(ctx, rdb, "k", time.Minute)
		assert.NilError(t, err)
	}

	assert.NilError(t, failcount.Refund(ctx, rdb, "k"))

	n, err := failcount.Take(ctx, rdb, "k", time.Minute)
	assert.NilError(t, err)
	assert.Equal(t, n, int64(3))
}

// Refunding a key that is gone (window expired, or never taken) must not mint a
// counter, least of all one without a TTL.
func TestRefundOfAMissingKeyCreatesNothing(t *testing.T) {
	ctx := t.Context()
	rdb, mr := newRedis(t)

	assert.NilError(t, failcount.Refund(ctx, rdb, "k"))

	assert.Assert(t, !mr.Exists("k"))
}

// Giving back the only attempt removes the key, so the next take re-arms a
// fresh window instead of finding a zero counter with whatever TTL is left.
func TestRefundOfTheLastAttemptRemovesTheKey(t *testing.T) {
	ctx := t.Context()
	rdb, mr := newRedis(t)
	_, err := failcount.Take(ctx, rdb, "k", time.Minute)
	assert.NilError(t, err)

	assert.NilError(t, failcount.Refund(ctx, rdb, "k"))

	assert.Assert(t, !mr.Exists("k"))
}
