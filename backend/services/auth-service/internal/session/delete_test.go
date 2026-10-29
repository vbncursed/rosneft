package session_test

import (
	"testing"
	"time"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/redistest"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/session"
)

// DeleteUserExcept ends every other session of the user, leaves the kept one,
// another user's sessions and the user's set alone, and takes the dead tokens
// out of the set: leftover members are never cleaned up otherwise and grow the
// set until the absolute TTL.
func TestDeleteUserExceptKeepsOneAndTidiesTheSet(t *testing.T) {
	ctx := t.Context()
	rdb, mr := redistest.Mini(t)
	st := session.New(rdb, time.Hour, 2*time.Hour, time.Minute, 5, time.Hour)
	mint := func(uid string) string {
		tok, err := st.Create(ctx, domain.Session{UserID: uid})
		assert.NilError(t, err)
		return tok
	}
	keep, other1, other2, bystander := mint("u1"), mint("u1"), mint("u1"), mint("u2")

	assert.NilError(t, st.DeleteUserExcept(ctx, "u1", keep))

	for _, tok := range []string{other1, other2} {
		_, err := st.Get(ctx, tok)
		assert.ErrorIs(t, err, domain.ErrSessionInvalid)
	}
	for _, tok := range []string{keep, bystander} {
		_, err := st.Get(ctx, tok)
		assert.NilError(t, err)
	}
	members, err := mr.SMembers("user_sessions:u1")
	assert.NilError(t, err)
	assert.DeepEqual(t, members, []string{keep})
}
