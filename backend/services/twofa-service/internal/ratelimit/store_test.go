package ratelimit_test

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/ratelimit"
)

// With a budget of 2, two attempts spend it; giving one back makes room for
// exactly one more.
func TestRefundGivesBackOneAttempt(t *testing.T) {
	ctx := t.Context()
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	st := ratelimit.New(rdb, 2, time.Hour)
	for range 2 {
		ok, err := st.TakeAttempt(ctx, "u1")
		assert.NilError(t, err)
		assert.Assert(t, ok)
	}

	assert.NilError(t, st.Refund(ctx, "u1"))

	ok, err := st.TakeAttempt(ctx, "u1")
	assert.NilError(t, err)
	assert.Assert(t, ok)
	ok, err = st.TakeAttempt(ctx, "u1")
	assert.NilError(t, err)
	assert.Assert(t, !ok)
}

func newStore(t *testing.T) *ratelimit.Store {
	t.Helper()
	rdb := redis.NewClient(&redis.Options{Addr: miniredis.RunT(t).Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	return ratelimit.New(rdb, 5, time.Hour)
}

// A step is claimed once, and only a later step may follow: an earlier or equal
// one is a replay of a code that was already spent.
func TestClaimStepAdvancesOnly(t *testing.T) {
	ctx := t.Context()
	st := newStore(t)
	for _, tt := range []struct {
		name string
		user string
		step int64
		want bool
	}{
		{"first claim", "u1", 100, true},
		{"same step again", "u1", 100, false},
		{"earlier step", "u1", 99, false},
		{"next step", "u1", 101, true},
		{"another user is independent", "u2", 100, true},
	} {
		got, err := st.ClaimStep(ctx, tt.user, tt.step)
		assert.NilError(t, err, tt.name)
		assert.Equal(t, got, tt.want, tt.name)
	}
}

// The same valid code submitted in parallel (a phished code raced against the
// owner's) must win exactly once.
func TestClaimStepIsAtomicUnderConcurrency(t *testing.T) {
	ctx := t.Context()
	st := newStore(t)
	var wins atomic.Int32
	var wg sync.WaitGroup
	for range 32 {
		wg.Go(func() {
			if ok, err := st.ClaimStep(ctx, "u1", 7); err == nil && ok {
				wins.Add(1)
			}
		})
	}
	wg.Wait()
	assert.Equal(t, wins.Load(), int32(1))
}
