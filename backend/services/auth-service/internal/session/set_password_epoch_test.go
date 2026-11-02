package session_test

import (
	"testing"
	"time"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/redistest"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/session"
)

func newStore(t *testing.T) *session.Store {
	t.Helper()
	rdb, _ := redistest.Mini(t)
	return session.New(rdb, time.Hour, 2*time.Hour, time.Minute, 5, time.Hour)
}

// The epoch is rewritten into the stored payload, and the rest of the session is untouched.
func TestSetPasswordEpochRewritesThePayload(t *testing.T) {
	ctx := t.Context()
	st := newStore(t)
	tok, err := st.Create(ctx, domain.Session{UserID: "u1", Status: domain.StatusActive, PwEpoch: 5})
	assert.NilError(t, err)

	assert.NilError(t, st.SetPasswordEpoch(ctx, tok, 9))

	sess, err := st.Get(ctx, tok)
	assert.NilError(t, err)
	assert.Equal(t, sess.PwEpoch, int64(9))
	assert.Equal(t, sess.UserID, "u1")
	assert.Equal(t, sess.Status, domain.StatusActive)
}

func TestSetPasswordEpochDoesNotRefreshTheTTL(t *testing.T) {
	ctx := t.Context()
	rdb, mr := redistest.Mini(t)
	st := session.New(rdb, time.Hour, 2*time.Hour, time.Minute, 5, time.Hour)
	tok, err := st.Create(ctx, domain.Session{UserID: "u1"})
	assert.NilError(t, err)
	mr.FastForward(40 * time.Minute)

	assert.NilError(t, st.SetPasswordEpoch(ctx, tok, 9))

	assert.Assert(t, mr.TTL("session:"+tok) <= 20*time.Minute, "TTL was reset: %s", mr.TTL("session:"+tok))
	assert.Assert(t, mr.TTL("session:"+tok) > 0)
}

// A session logged out between the read and the write must stay gone, and a
// token that never existed is not an error.
func TestSetPasswordEpochNeverResurrectsASession(t *testing.T) {
	ctx := t.Context()
	st := newStore(t)
	tok, err := st.Create(ctx, domain.Session{UserID: "u1"})
	assert.NilError(t, err)
	assert.NilError(t, st.Delete(ctx, tok))

	assert.NilError(t, st.SetPasswordEpoch(ctx, tok, 9))
	assert.NilError(t, st.SetPasswordEpoch(ctx, "no-such-token", 9))

	_, err = st.Get(ctx, tok)
	assert.ErrorIs(t, err, domain.ErrSessionInvalid)
}
