package session_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/suite"
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

type DeleteUserSuite struct{ suite.Suite }

func TestDeleteUserSuite(t *testing.T) { suite.Run(t, new(DeleteUserSuite)) }

func (s *DeleteUserSuite) TestRevoke() {
	s.Run("multiple sessions and another user", func() {
		t := s.T()
		ctx := t.Context()
		rdb, mr := redistest.Mini(t)
		store := session.New(rdb, time.Hour, 2*time.Hour, time.Minute, 5, time.Hour)
		mint := func(user string) string {
			token, err := store.Create(ctx, domain.Session{UserID: user})
			assert.NilError(t, err)
			return token
		}
		first, second, other := mint("u1"), mint("u1"), mint("u2")
		assert.NilError(t, store.DeleteUser(ctx, "u1"))
		for _, token := range []string{first, second} {
			_, err := store.Get(ctx, token)
			assert.ErrorIs(t, err, domain.ErrSessionInvalid)
		}
		_, err := store.Get(ctx, other)
		assert.NilError(t, err)
		assert.Assert(t, !mr.Exists("user_sessions:u1"))
		assert.Assert(t, mr.Exists("user_sessions:u2"))
		assert.NilError(t, store.DeleteUser(ctx, "u1"))
	})
	s.Run("empty user", func() {
		t := s.T()
		rdb, _ := redistest.Mini(t)
		store := session.New(rdb, time.Hour, 2*time.Hour, time.Minute, 5, time.Hour)
		assert.NilError(t, store.DeleteUser(t.Context(), "missing"))
	})
	s.Run("missing session", func() {
		t := s.T()
		ctx := t.Context()
		rdb, mr := redistest.Mini(t)
		store := session.New(rdb, time.Hour, 2*time.Hour, time.Minute, 5, time.Hour)
		token, err := store.Create(ctx, domain.Session{UserID: "u1"})
		assert.NilError(t, err)
		mr.Del("session:" + token)
		assert.NilError(t, store.DeleteUser(ctx, "u1"))
		assert.Assert(t, !mr.Exists("user_sessions:u1"))
	})
}

type deleteUserFailureHook struct {
	stage string
	err   error
}

func (h deleteUserFailureHook) DialHook(next redis.DialHook) redis.DialHook { return next }
func (h deleteUserFailureHook) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		if h.stage == "members" && cmd.Name() == "smembers" {
			return h.err
		}
		return next(ctx, cmd)
	}
}

func (h deleteUserFailureHook) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return func(ctx context.Context, cmds []redis.Cmder) error {
		if h.stage == "exec" {
			return h.err
		}
		return next(ctx, cmds)
	}
}

func (s *DeleteUserSuite) TestErrors() {
	for _, stage := range []string{"members", "exec"} {
		s.Run(stage, func() {
			t := s.T()
			rdb, _ := redistest.Mini(t)
			assert.NilError(t, rdb.Ping(t.Context()).Err())
			failure := errors.New("redis unavailable")
			rdb.AddHook(deleteUserFailureHook{stage: stage, err: failure})
			store := session.New(rdb, time.Hour, 2*time.Hour, time.Minute, 5, time.Hour)
			err := store.DeleteUser(t.Context(), "u1")
			assert.ErrorIs(t, err, failure)
			assert.ErrorContains(t, err, "session.DeleteUser: "+stage+":")
		})
	}
	s.Run("cancelled context", func() {
		t := s.T()
		rdb, _ := redistest.Mini(t)
		store := session.New(rdb, time.Hour, 2*time.Hour, time.Minute, 5, time.Hour)
		ctx, cancel := context.WithCancel(t.Context())
		cancel()
		err := store.DeleteUser(ctx, "u1")
		assert.ErrorIs(t, err, context.Canceled)
		assert.ErrorContains(t, err, "session.DeleteUser: members:")
	})
}
