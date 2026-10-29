package session_test

import (
	"testing"
	"time"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/redistest"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/session"
)

// Exactly maxFails guesses are allowed and the next one is refused: the budget
// is "n <= maxFails", not one short and not one over.
func TestTakeAttemptAllowsExactlyMaxFailsGuesses(t *testing.T) {
	ctx := t.Context()
	rdb, _ := redistest.Mini(t)
	st := session.New(rdb, time.Hour, time.Hour, time.Minute, 3, time.Hour)

	for i := 1; i <= 3; i++ {
		ok, err := st.TakeAttempt(ctx, "ivan")
		assert.NilError(t, err)
		assert.Assert(t, ok, "guess %d of 3 must be allowed", i)
	}
	ok, err := st.TakeAttempt(ctx, "ivan")
	assert.NilError(t, err)
	assert.Assert(t, !ok, "the 4th guess must be refused")

	// Another identifier has its own budget.
	ok, err = st.TakeAttempt(ctx, "petr")
	assert.NilError(t, err)
	assert.Assert(t, ok)
}

// The change-password budget locks too, under its own counter (a spent login
// budget does not lock it and vice versa), and a clear reopens it.
func TestTakeChangePasswordAttemptLocksAfterMaxFails(t *testing.T) {
	ctx := t.Context()
	rdb, _ := redistest.Mini(t)
	st := session.New(rdb, time.Hour, time.Hour, time.Minute, 3, time.Hour)

	for i := 1; i <= 3; i++ {
		ok, err := st.TakeChangePasswordAttempt(ctx, "u1")
		assert.NilError(t, err)
		assert.Assert(t, ok, "attempt %d of 3 must be allowed", i)
	}
	ok, err := st.TakeChangePasswordAttempt(ctx, "u1")
	assert.NilError(t, err)
	assert.Assert(t, !ok, "the 4th attempt must be refused")

	ok, err = st.TakeAttempt(ctx, "u1")
	assert.NilError(t, err)
	assert.Assert(t, ok, "the login budget is a separate counter")

	assert.NilError(t, st.ClearChangePasswordFails(ctx, "u1"))
	ok, err = st.TakeChangePasswordAttempt(ctx, "u1")
	assert.NilError(t, err)
	assert.Assert(t, ok, "a successful change reopens the budget")
}
