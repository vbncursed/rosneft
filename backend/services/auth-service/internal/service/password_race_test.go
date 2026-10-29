package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/redistest"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/auth"
	authmocks "github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/auth/mocks"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users"
	usermocks "github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users/mocks"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/session"
)

// A Login with the OLD password reads the user, spends its time in the argon2
// check, and only then creates the session. A password change that completes in
// between (hash stored, other sessions swept) used to leave that session alive:
// it was created after the sweep. This runs the interleaving deterministically,
// over the real session store, both services and the real ValidateToken.
func TestLoginRacingAPasswordChangeLeavesNoLiveSession(t *testing.T) {
	ctx := t.Context()
	rdb, _ := redistest.Mini(t)
	sessions := session.New(rdb, time.Hour, 24*time.Hour, time.Minute, 5, time.Hour)
	mc := minimock.NewController(t)

	oldHash, err := password.Hash("old-password")
	assert.NilError(t, err)
	row := domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: oldHash} // the user table
	staleRead := row                                                                 // what the racing Login reads

	userStore := authmocks.NewUserStoreMock(mc)
	twofa := authmocks.NewTwoFAVerifierMock(mc)
	twofa.IsEnabledMock.Return(false, nil)
	authSvc := auth.New(userStore, sessions, twofa, authmocks.NewPasskeyVerifierMock(mc), time.Hour)
	userStore.GetByIDMock.Set(func(context.Context, string) (domain.User, error) { return row, nil })
	userStore.ResolveOwningAdminMock.Return("", nil)

	store := usermocks.NewStoreMock(mc)
	store.GetByIDMock.Set(func(context.Context, string) (domain.User, error) { return row, nil })
	store.ChangePasswordMock.Set(func(_ context.Context, _, hash string, at time.Time) error {
		row.PasswordHash, row.PasswordChangedAt = hash, &at
		return nil
	})
	usersSvc := users.New(store, sessions)
	usersSvc.OnPasswordChange(authSvc.ForgetUser)

	// The owner's own session, and the user's session on another device.
	owner, err := sessions.Create(ctx, domain.Session{UserID: "u1", PwEpoch: row.PasswordEpoch()})
	assert.NilError(t, err)

	// Login reads the user; the whole password change lands before it finishes.
	userStore.GetByIdentifierMock.Set(func(context.Context, string) (domain.User, error) {
		assert.NilError(t, usersSvc.ChangePassword(ctx, "u1", owner, "old-password", "NewPassw0rd!"))
		return staleRead, nil
	})
	raced, _, err := authSvc.Login(ctx, "u1@example.com", "old-password")
	assert.NilError(t, err) // the old password was right when it was read

	_, _, _, _, _, _, err = authSvc.ValidateToken(ctx, raced)
	assert.ErrorIs(t, err, domain.ErrSessionInvalid, "a session minted under the old password must be dead")

	_, _, _, _, _, _, err = authSvc.ValidateToken(ctx, owner)
	assert.NilError(t, err, "the session that changed the password must survive")

	// A Login with the new password after the change gets a working session.
	userStore.GetByIdentifierMock.Set(func(context.Context, string) (domain.User, error) { return row, nil })
	fresh, _, err := authSvc.Login(ctx, "u1@example.com", "NewPassw0rd!")
	assert.NilError(t, err)
	_, _, _, _, _, _, err = authSvc.ValidateToken(ctx, fresh)
	assert.NilError(t, err)
}
