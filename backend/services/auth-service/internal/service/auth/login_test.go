package auth_test

import (
	"testing"
	"time"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/auth"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/auth/mocks"
)

func newSvc(t *testing.T) (*auth.Service, *mocks.UserStoreMock, *mocks.SessionStoreMock, *mocks.RecoveryStoreMock) {
	mc := minimock.NewController(t)
	us := mocks.NewUserStoreMock(mc)
	ss := mocks.NewSessionStoreMock(mc)
	rs := mocks.NewRecoveryStoreMock(mc)
	return auth.New(us, ss, rs, nil, 720*time.Hour), us, ss, rs
}

func TestLoginSuccessNo2FA(t *testing.T) {
	svc, us, ss, _ := newSvc(t)
	ctx := t.Context()
	hash, _ := password.Hash("pw")
	u := domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash, Permissions: []string{"territory:read"}}

	ss.IsLockedMock.Expect(ctx, "ivan").Return(false, nil)
	us.GetByIdentifierMock.Expect(ctx, "ivan").Return(u, nil)
	ss.ClearFailsMock.Expect(ctx, "ivan").Return(nil)
	ss.CreateMock.Return("tok123", nil)

	token, challenge, err := svc.Login(ctx, "ivan", "pw")
	assert.NilError(t, err)
	assert.Equal(t, token, "tok123")
	assert.Equal(t, challenge, "")
}

func TestLoginWrongPassword(t *testing.T) {
	svc, us, ss, _ := newSvc(t)
	ctx := t.Context()
	hash, _ := password.Hash("pw")
	ss.IsLockedMock.Expect(ctx, "ivan").Return(false, nil)
	us.GetByIdentifierMock.Expect(ctx, "ivan").Return(domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash}, nil)
	ss.RegisterFailMock.Expect(ctx, "ivan").Return(nil)

	_, _, err := svc.Login(ctx, "ivan", "WRONG")
	assert.ErrorIs(t, err, domain.ErrInvalidCredential)
}

func TestLoginFrozen(t *testing.T) {
	svc, us, ss, _ := newSvc(t)
	ctx := t.Context()
	hash, _ := password.Hash("pw")
	ss.IsLockedMock.Expect(ctx, "ivan").Return(false, nil)
	us.GetByIdentifierMock.Expect(ctx, "ivan").Return(domain.User{ID: "u1", Status: domain.StatusFrozen, PasswordHash: hash}, nil)

	_, _, err := svc.Login(ctx, "ivan", "pw")
	assert.ErrorIs(t, err, domain.ErrAccountFrozen)
}

func TestLoginThrottled(t *testing.T) {
	svc, _, ss, _ := newSvc(t)
	ctx := t.Context()
	ss.IsLockedMock.Expect(ctx, "ivan").Return(true, nil)
	_, _, err := svc.Login(ctx, "ivan", "pw")
	assert.ErrorIs(t, err, domain.ErrLoginThrottled)
}

func TestLogin2FARequired(t *testing.T) {
	svc, us, ss, _ := newSvc(t)
	ctx := t.Context()
	hash, _ := password.Hash("pw")
	ss.IsLockedMock.Expect(ctx, "ivan").Return(false, nil)
	us.GetByIdentifierMock.Expect(ctx, "ivan").Return(domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash, TOTPEnabled: true}, nil)
	ss.ClearFailsMock.Expect(ctx, "ivan").Return(nil)
	ss.PutPendingMock.Expect(ctx, "u1").Return("chal1", nil)

	token, challenge, err := svc.Login(ctx, "ivan", "pw")
	assert.NilError(t, err)
	assert.Equal(t, token, "")
	assert.Equal(t, challenge, "chal1")
}
