package failcount_test

import (
	"testing"
	"time"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/failcount"
)

func TestTakeCountsFromOne(t *testing.T) {
	ctx := t.Context()
	rdb, _ := newRedis(t)

	for want := int64(1); want <= 3; want++ {
		got, err := failcount.Take(ctx, rdb, "k", time.Minute)
		assert.NilError(t, err)
		assert.Equal(t, got, want)
	}
}

// A counter found without a TTL (written by something else, or left by the old
// INCR-then-EXPIRE code after a crash) would lock the key forever: Take re-arms
// it.
func TestTakeRearmsACounterThatHasNoTTL(t *testing.T) {
	ctx := t.Context()
	rdb, mr := newRedis(t)
	assert.NilError(t, rdb.Set(ctx, "k", "4", 0).Err())
	assert.Equal(t, mr.TTL("k"), time.Duration(0))

	n, err := failcount.Take(ctx, rdb, "k", time.Minute)

	assert.NilError(t, err)
	assert.Equal(t, n, int64(5))
	assert.Equal(t, mr.TTL("k"), time.Minute, "a counter without a TTL must be re-armed")
}

// The window is fixed from the first attempt: later attempts do not extend it,
// or a patient attacker (or an honest user retrying) would keep a lock alive
// forever. After the window the counter starts again at 1.
func TestTakeDoesNotSlideTheWindow(t *testing.T) {
	ctx := t.Context()
	rdb, mr := newRedis(t)
	_, err := failcount.Take(ctx, rdb, "k", time.Minute)
	assert.NilError(t, err)

	mr.FastForward(40 * time.Second)
	_, err = failcount.Take(ctx, rdb, "k", time.Minute)
	assert.NilError(t, err)
	assert.Equal(t, mr.TTL("k"), 20*time.Second, "a later attempt must not extend the window")

	mr.FastForward(21 * time.Second)
	n, err := failcount.Take(ctx, rdb, "k", time.Minute)
	assert.NilError(t, err)
	assert.Equal(t, n, int64(1), "the window ended 61s after the first attempt")
}
