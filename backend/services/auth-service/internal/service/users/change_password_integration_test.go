//go:build integration

package users_test

import (
	"context"
	"testing"
	"time"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/redistest"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users/mocks"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/session"
)

// Whoever knew the old password (a thief with a stolen cookie) must be signed
// out when the owner changes it: every other session dies, the one that made
// the change lives, and other users are untouched.
func TestChangePasswordRevokesOtherSessionsKeepsCurrent(t *testing.T) {
	ctx := t.Context()
	sessions := session.New(redistest.Client(t), time.Hour, time.Hour, time.Minute, 5, time.Hour)
	mint := func(uid string) string {
		tok, err := sessions.Create(ctx, domain.Session{UserID: uid, Status: domain.StatusActive})
		assert.NilError(t, err)
		return tok
	}
	current, stolen, bystander := mint("u1"), mint("u1"), mint("u2")

	hash, err := password.Hash("correct-horse")
	assert.NilError(t, err)
	mc := minimock.NewController(t)
	st := mocks.NewStoreMock(mc)
	st.GetByIDMock.Return(domain.User{ID: "u1", PasswordHash: hash}, nil)
	st.ChangePasswordMock.Set(func(_ context.Context, _, _ string, at time.Time) (time.Time, error) { return at, nil })
	svc := users.New(st, sessions)

	assert.NilError(t, svc.ChangePassword(ctx, "u1", current, "correct-horse", "NewPassw0rd!"))

	_, err = sessions.Get(ctx, stolen)
	assert.Assert(t, err != nil, "another session of the user survived the password change")
	_, err = sessions.Get(ctx, current)
	assert.NilError(t, err)
	_, err = sessions.Get(ctx, bystander)
	assert.NilError(t, err)
}
