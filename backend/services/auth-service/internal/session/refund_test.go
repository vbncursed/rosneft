package session_test

import (
	"testing"
	"time"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/redistest"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/session"
)

// With a budget of 2, two attempts spend it; giving one back makes room for
// exactly one more.
func TestRefundAttemptGivesBackOneLoginAttempt(t *testing.T) {
	ctx := t.Context()
	rdb, _ := redistest.Mini(t)
	st := session.New(rdb, time.Hour, time.Hour, time.Minute, 2, time.Hour)
	for range 2 {
		ok, err := st.TakeAttempt(ctx, "ivan")
		assert.NilError(t, err)
		assert.Assert(t, ok)
	}

	assert.NilError(t, st.RefundAttempt(ctx, "ivan"))

	ok, err := st.TakeAttempt(ctx, "ivan")
	assert.NilError(t, err)
	assert.Assert(t, ok, "the refunded attempt was not given back")
	ok, err = st.TakeAttempt(ctx, "ivan")
	assert.NilError(t, err)
	assert.Assert(t, !ok, "a refund must give back one attempt, not reset the counter")
}

func TestRefundChangePasswordAttemptGivesBackOneAttempt(t *testing.T) {
	ctx := t.Context()
	rdb, _ := redistest.Mini(t)
	st := session.New(rdb, time.Hour, time.Hour, time.Minute, 2, time.Hour)
	for range 2 {
		ok, err := st.TakeChangePasswordAttempt(ctx, "u1")
		assert.NilError(t, err)
		assert.Assert(t, ok)
	}

	assert.NilError(t, st.RefundChangePasswordAttempt(ctx, "u1"))

	ok, err := st.TakeChangePasswordAttempt(ctx, "u1")
	assert.NilError(t, err)
	assert.Assert(t, ok)
	ok, err = st.TakeChangePasswordAttempt(ctx, "u1")
	assert.NilError(t, err)
	assert.Assert(t, !ok)
}
