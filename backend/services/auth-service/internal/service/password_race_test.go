package service_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/gojuno/minimock/v3"
	"github.com/redis/go-redis/v9"
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
	store.ChangePasswordMock.Set(func(_ context.Context, _, hash string, at time.Time) (time.Time, error) {
		row.PasswordHash, row.PasswordChangedAt = hash, &at
		return at, nil
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

// failingCleanup is the real session store whose sweeps fail, as a Redis error
// right after the hash was stored would.
type failingCleanup struct{ *session.Store }

func (failingCleanup) DeleteUserExcept(context.Context, string, string) error {
	return errors.New("redis down")
}

func (failingCleanup) DeleteUser(context.Context, string) error { return errors.New("redis down") }

// putLegacy stores a session the way the code before epochs wrote it: no
// pw_epoch field in the JSON. Minted `age` ago, for a one-hour absolute TTL.
func putLegacy(t *testing.T, rdb *redis.Client, uid, token string, age time.Duration) {
	t.Helper()
	raw, err := json.Marshal(map[string]any{
		"user_id":         uid,
		"status":          domain.StatusActive,
		"absolute_expiry": time.Now().Add(time.Hour - age),
	})
	assert.NilError(t, err)
	assert.NilError(t, rdb.Set(t.Context(), "session:"+token, raw, time.Hour).Err())
	assert.NilError(t, rdb.SAdd(t.Context(), "user_sessions:"+uid, token).Err())
}

// A session stored before the deploy has no epoch. When the cleanup after a
// password change fails (only logged now), the epoch alone must still refuse it
// - and, before any change, the deploy must not sign it out.
func TestPreDeploySessionDiesOnPasswordChangeEvenWhenCleanupFails(t *testing.T) {
	ctx := t.Context()
	rdb, _ := redistest.Mini(t)
	sessions := session.New(rdb, time.Hour, 24*time.Hour, time.Minute, 5, time.Hour)
	mc := minimock.NewController(t)

	hash, err := password.Hash("old-password")
	assert.NilError(t, err)
	row := domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash}

	userStore := authmocks.NewUserStoreMock(mc)
	userStore.GetByIDMock.Set(func(context.Context, string) (domain.User, error) { return row, nil })
	userStore.ResolveOwningAdminMock.Return("", nil)
	authSvc := auth.New(
		userStore,
		sessions,
		authmocks.NewTwoFAVerifierMock(mc),
		authmocks.NewPasskeyVerifierMock(mc),
		time.Hour,
	)

	store := usermocks.NewStoreMock(mc)
	store.GetByIDMock.Set(func(context.Context, string) (domain.User, error) { return row, nil })
	store.ChangePasswordMock.Set(func(_ context.Context, _, hash string, at time.Time) (time.Time, error) {
		row.PasswordHash, row.PasswordChangedAt = hash, &at
		return at, nil
	})
	usersSvc := users.New(store, failingCleanup{sessions})
	usersSvc.OnPasswordChange(authSvc.ForgetUser)

	putLegacy(t, rdb, "u1", "stolen", time.Minute)
	owner, err := sessions.Create(ctx, domain.Session{UserID: "u1", PwEpoch: row.PasswordEpoch()})
	assert.NilError(t, err)

	_, _, _, _, _, _, err = authSvc.ValidateToken(ctx, "stolen")
	assert.NilError(t, err, "the deploy itself must not sign out a pre-deploy session")

	assert.NilError(t, usersSvc.ChangePassword(ctx, "u1", owner, "old-password", "NewPassw0rd!"))

	_, _, _, _, _, _, err = authSvc.ValidateToken(ctx, "stolen")
	assert.ErrorIs(t, err, domain.ErrSessionInvalid, "a pre-deploy session survived a password change")
	_, _, _, _, _, _, err = authSvc.ValidateToken(ctx, owner)
	assert.NilError(t, err)
}

// The same for an admin reset (SetPassword), whose cleanup is DeleteUser.
func TestPreDeploySessionDiesOnAdminResetEvenWhenCleanupFails(t *testing.T) {
	ctx := t.Context()
	rdb, _ := redistest.Mini(t)
	sessions := session.New(rdb, time.Hour, 24*time.Hour, time.Minute, 5, time.Hour)
	mc := minimock.NewController(t)

	row := domain.User{ID: "u2", Status: domain.StatusActive}
	userStore := authmocks.NewUserStoreMock(mc)
	userStore.GetByIDMock.Set(func(context.Context, string) (domain.User, error) { return row, nil })
	userStore.ResolveOwningAdminMock.Return("", nil)
	authSvc := auth.New(
		userStore,
		sessions,
		authmocks.NewTwoFAVerifierMock(mc),
		authmocks.NewPasskeyVerifierMock(mc),
		time.Hour,
	)

	store := usermocks.NewStoreMock(mc)
	store.GetByIDMock.Set(func(_ context.Context, id string) (domain.User, error) {
		if id == "root" {
			return domain.User{ID: "root", IsOwner: true}, nil
		}
		return row, nil
	})
	store.ChangePasswordMock.Set(func(_ context.Context, _, _ string, at time.Time) (time.Time, error) {
		row.PasswordChangedAt = &at
		return at, nil
	})
	usersSvc := users.New(store, failingCleanup{sessions})
	usersSvc.OnPasswordChange(authSvc.ForgetUser)

	putLegacy(t, rdb, "u2", "stolen", time.Minute)
	_, _, _, _, _, _, err := authSvc.ValidateToken(ctx, "stolen")
	assert.NilError(t, err)

	assert.NilError(t, usersSvc.SetPassword(ctx, "root", true, "u2", "N3w-Passw0rd!"))

	_, _, _, _, _, _, err = authSvc.ValidateToken(ctx, "stolen")
	assert.ErrorIs(t, err, domain.ErrSessionInvalid)
}
