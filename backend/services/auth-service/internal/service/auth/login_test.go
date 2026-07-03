package auth_test

import (
	"context"
	"testing"
	"time"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/auth"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/auth/mocks"
)

type LoginSuite struct {
	suite.Suite
	svc *auth.Service
	us  *mocks.UserStoreMock
	ss  *mocks.SessionStoreMock
	tf  *mocks.TwoFAVerifierMock
	ctx context.Context
}

func TestLoginSuite(t *testing.T) {
	suite.Run(t, new(LoginSuite))
}

func (s *LoginSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.us = mocks.NewUserStoreMock(mc)
	s.ss = mocks.NewSessionStoreMock(mc)
	s.tf = mocks.NewTwoFAVerifierMock(mc)
	s.svc = auth.New(s.us, s.ss, s.tf, 720*time.Hour)
	s.ctx = s.T().Context()
}

func (s *LoginSuite) TestLoginSuccessNo2FA() {
	hash, _ := password.Hash("pw")
	u := domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash, Permissions: []string{"territory:read"}}

	s.ss.IsLockedMock.Expect(s.ctx, "ivan").Return(false, nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ivan").Return(u, nil)
	s.ss.ClearFailsMock.Expect(s.ctx, "ivan").Return(nil)
	s.tf.IsEnabledMock.Expect(s.ctx, "u1").Return(false, nil)
	s.ss.CreateMock.Return("tok123", nil)

	token, challenge, err := s.svc.Login(s.ctx, "ivan", "pw")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), token, "tok123")
	assert.Equal(s.T(), challenge, "")
}

func (s *LoginSuite) TestLoginWrongPassword() {
	hash, _ := password.Hash("pw")
	s.ss.IsLockedMock.Expect(s.ctx, "ivan").Return(false, nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ivan").Return(domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash}, nil)
	s.ss.RegisterFailMock.Expect(s.ctx, "ivan").Return(nil)

	_, _, err := s.svc.Login(s.ctx, "ivan", "WRONG")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidCredential)
}

func (s *LoginSuite) TestLoginFrozen() {
	hash, _ := password.Hash("pw")
	s.ss.IsLockedMock.Expect(s.ctx, "ivan").Return(false, nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ivan").Return(domain.User{ID: "u1", Status: domain.StatusFrozen, PasswordHash: hash}, nil)

	_, _, err := s.svc.Login(s.ctx, "ivan", "pw")
	assert.ErrorIs(s.T(), err, domain.ErrAccountFrozen)
}

func (s *LoginSuite) TestLoginThrottled() {
	s.ss.IsLockedMock.Expect(s.ctx, "ivan").Return(true, nil)
	_, _, err := s.svc.Login(s.ctx, "ivan", "pw")
	assert.ErrorIs(s.T(), err, domain.ErrLoginThrottled)
}

func (s *LoginSuite) TestLogin2FARequired() {
	hash, _ := password.Hash("pw")
	s.ss.IsLockedMock.Expect(s.ctx, "ivan").Return(false, nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ivan").Return(domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash}, nil)
	s.ss.ClearFailsMock.Expect(s.ctx, "ivan").Return(nil)
	s.tf.IsEnabledMock.Expect(s.ctx, "u1").Return(true, nil)
	s.ss.PutPendingMock.Expect(s.ctx, "u1").Return("chal1", nil)

	token, challenge, err := s.svc.Login(s.ctx, "ivan", "pw")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), token, "")
	assert.Equal(s.T(), challenge, "chal1")
}
