package auth_test

import (
	"context"
	"errors"
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
	pk  *mocks.PasskeyVerifierMock
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
	s.pk = mocks.NewPasskeyVerifierMock(mc)
	s.svc = auth.New(s.us, s.ss, s.tf, s.pk, 720*time.Hour)
	s.ctx = s.T().Context()
}

func (s *LoginSuite) TestLoginSuccessNo2FA() {
	hash, _ := password.Hash("pw")
	u := domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash, Permissions: []string{"territory:read"}}

	s.ss.TakeAttemptMock.Expect(s.ctx, "ivan").Return(true, nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ivan").Return(u, nil)
	s.ss.ClearFailsMock.Expect(s.ctx, "ivan").Return(nil)
	s.tf.IsEnabledMock.Expect(s.ctx, "u1").Return(false, nil)
	s.ss.CreateMock.Return("tok123", nil)

	token, challenge, err := s.svc.Login(s.ctx, "ivan", "pw")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), token, "tok123")
	assert.Equal(s.T(), challenge, "")
}

// A wrong password is a guess: it stays counted, so neither Refund nor Clear
// is expected (the strict mock fails the test if either is called).
func (s *LoginSuite) TestLoginWrongPassword() {
	hash, _ := password.Hash("pw")
	s.ss.TakeAttemptMock.Expect(s.ctx, "ivan").Return(true, nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ivan").
		Return(domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash}, nil)

	_, _, err := s.svc.Login(s.ctx, "ivan", "WRONG")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidCredential)
}

func (s *LoginSuite) TestLoginFrozen() {
	hash, _ := password.Hash("pw")
	s.ss.TakeAttemptMock.Expect(s.ctx, "ivan").Return(true, nil)
	s.ss.ClearFailsMock.Expect(s.ctx, "ivan").Return(nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ivan").
		Return(domain.User{ID: "u1", Status: domain.StatusFrozen, PasswordHash: hash}, nil)

	_, _, err := s.svc.Login(s.ctx, "ivan", "pw")
	assert.ErrorIs(s.T(), err, domain.ErrAccountFrozen)
}

func (s *LoginSuite) TestLoginThrottled() {
	s.ss.TakeAttemptMock.Expect(s.ctx, "ivan").Return(false, nil)
	_, _, err := s.svc.Login(s.ctx, "ivan", "pw")
	assert.ErrorIs(s.T(), err, domain.ErrLoginThrottled)
}

func (s *LoginSuite) TestLogin2FARequired() {
	hash, _ := password.Hash("pw")
	s.ss.TakeAttemptMock.Expect(s.ctx, "ivan").Return(true, nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ivan").
		Return(domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash}, nil)
	s.ss.ClearFailsMock.Expect(s.ctx, "ivan").Return(nil)
	s.tf.IsEnabledMock.Expect(s.ctx, "u1").Return(true, nil)
	s.ss.PutPendingMock.Expect(s.ctx, "u1").Return("chal1", nil)

	token, challenge, err := s.svc.Login(s.ctx, "ivan", "pw")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), token, "")
	assert.Equal(s.T(), challenge, "chal1")
}

// Throttling is keyed on the identifier, so an unfolded key gives each case
// variant its own attempt counter against the same account and multiplies the
// brute-force budget. Every session call must see the folded form.
func (s *LoginSuite) TestLoginFoldsIdentifier() {
	hash, _ := password.Hash("pw")
	u := domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash}

	s.ss.TakeAttemptMock.Expect(s.ctx, "ernest@gmail.com").Return(true, nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ernest@gmail.com").Return(u, nil)
	s.ss.ClearFailsMock.Expect(s.ctx, "ernest@gmail.com").Return(nil)
	s.tf.IsEnabledMock.Expect(s.ctx, "u1").Return(false, nil)
	s.ss.CreateMock.Return("tok123", nil)

	token, _, err := s.svc.Login(s.ctx, "  Ernest@Gmail.COM ", "pw")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), token, "tok123")
}

// A failed attempt must register against the folded key too, or the counter it
// increments is not the one the next attempt is checked against.
func (s *LoginSuite) TestLoginFoldsIdentifierOnFailure() {
	hash, _ := password.Hash("pw")
	u := domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash}

	s.ss.TakeAttemptMock.Expect(s.ctx, "ernest@gmail.com").Return(true, nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ernest@gmail.com").Return(u, nil)

	_, _, err := s.svc.Login(s.ctx, "Ernest@Gmail.COM", "wrong")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidCredential)
}

// A whitespace-only identifier must be rejected as invalid input, not carried
// into the session store. Folding after the empty check let "   " through the
// guard and keyed the throttle on "", giving every such submission one shared
// bucket. No mock expectation is set here on purpose: minimock fails the test
// if Login reaches the session store at all.
func (s *LoginSuite) TestLoginRejectsWhitespaceOnlyIdentifier() {
	_, _, err := s.svc.Login(s.ctx, "   ", "pw")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *LoginSuite) TestLoginRejectsEmptyPassword() {
	_, _, err := s.svc.Login(s.ctx, "ivan", "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.ErrorContains(s.T(), err, "identifier and password required")
}

func (s *LoginSuite) TestLoginLockCheckErrorIsReturned() {
	boom := errors.New("redis down")
	s.ss.TakeAttemptMock.Expect(s.ctx, "ivan").Return(false, boom)

	_, _, err := s.svc.Login(s.ctx, "ivan", "pw")
	assert.Equal(s.T(), err, boom)
}

// A stored hash that cannot be parsed is a server fault, not a guess: the
// reserved attempt is given back (RefundAttempt), and never cleared — a clear
// would also wipe the guesses already counted.
func (s *LoginSuite) TestLoginMalformedHashIsVerifyError() {
	s.ss.TakeAttemptMock.Expect(s.ctx, "ivan").Return(true, nil)
	s.ss.RefundAttemptMock.Expect(s.ctx, "ivan").Return(nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ivan").
		Return(domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: "not-a-phc"}, nil)

	_, _, err := s.svc.Login(s.ctx, "ivan", "pw")
	assert.Assert(s.T(), err != nil)
	assert.Assert(s.T(), !errors.Is(err, domain.ErrInvalidCredential))
	assert.ErrorContains(s.T(), err, "auth.Login: verify: ")
}

func (s *LoginSuite) TestLoginDeleted() {
	hash, _ := password.Hash("pw")
	s.ss.TakeAttemptMock.Expect(s.ctx, "ivan").Return(true, nil)
	s.ss.ClearFailsMock.Expect(s.ctx, "ivan").Return(nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ivan").
		Return(domain.User{ID: "u1", Status: domain.StatusDeleted, PasswordHash: hash}, nil)

	_, _, err := s.svc.Login(s.ctx, "ivan", "pw")
	assert.ErrorIs(s.T(), err, domain.ErrAccountDeleted)
}

// The status is checked only after the password: a frozen account with a wrong
// password is a plain bad credential and counts as a failed attempt.
func (s *LoginSuite) TestLoginFrozenWrongPasswordIsInvalidCredential() {
	hash, _ := password.Hash("pw")
	s.ss.TakeAttemptMock.Expect(s.ctx, "ivan").Return(true, nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ivan").
		Return(domain.User{ID: "u1", Status: domain.StatusFrozen, PasswordHash: hash}, nil)

	_, _, err := s.svc.Login(s.ctx, "ivan", "WRONG")
	assert.Equal(s.T(), err, domain.ErrInvalidCredential)
}

func (s *LoginSuite) TestLoginTwoFAStatusErrorIsReturned() {
	hash, _ := password.Hash("pw")
	boom := errors.New("2fa store down")
	s.ss.TakeAttemptMock.Expect(s.ctx, "ivan").Return(true, nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ivan").
		Return(domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash}, nil)
	s.ss.ClearFailsMock.Expect(s.ctx, "ivan").Return(nil)
	s.tf.IsEnabledMock.Expect(s.ctx, "u1").Return(false, boom)

	token, challenge, err := s.svc.Login(s.ctx, "ivan", "pw")
	assert.Equal(s.T(), err, boom)
	assert.Equal(s.T(), token+challenge, "")
}

func (s *LoginSuite) TestLoginPutPendingErrorIsReturned() {
	hash, _ := password.Hash("pw")
	boom := errors.New("redis down")
	s.ss.TakeAttemptMock.Expect(s.ctx, "ivan").Return(true, nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ivan").
		Return(domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash}, nil)
	s.ss.ClearFailsMock.Expect(s.ctx, "ivan").Return(nil)
	s.tf.IsEnabledMock.Expect(s.ctx, "u1").Return(true, nil)
	s.ss.PutPendingMock.Expect(s.ctx, "u1").Return("", boom)

	token, challenge, err := s.svc.Login(s.ctx, "ivan", "pw")
	assert.Equal(s.T(), err, boom)
	assert.Equal(s.T(), token+challenge, "")
}

func (s *LoginSuite) TestLoginSessionCreateErrorIsReturned() {
	hash, _ := password.Hash("pw")
	boom := errors.New("redis down")
	s.ss.TakeAttemptMock.Expect(s.ctx, "ivan").Return(true, nil)
	s.us.GetByIdentifierMock.Expect(s.ctx, "ivan").
		Return(domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash}, nil)
	s.ss.ClearFailsMock.Expect(s.ctx, "ivan").Return(nil)
	s.tf.IsEnabledMock.Expect(s.ctx, "u1").Return(false, nil)
	s.ss.CreateMock.Return("", boom)

	token, challenge, err := s.svc.Login(s.ctx, "ivan", "pw")
	assert.Equal(s.T(), err, boom)
	assert.Equal(s.T(), token+challenge, "")
}
