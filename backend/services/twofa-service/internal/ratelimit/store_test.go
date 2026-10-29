package ratelimit_test

import (
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
