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

type VerifyPasswordSuite struct {
	suite.Suite
	svc *auth.Service
	us  *mocks.UserStoreMock
	ss  *mocks.SessionStoreMock
	ctx context.Context
}

func TestVerifyPasswordSuite(t *testing.T) {
	suite.Run(t, new(VerifyPasswordSuite))
}

func (s *VerifyPasswordSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.us = mocks.NewUserStoreMock(mc)
	s.ss = mocks.NewSessionStoreMock(mc)
	s.svc = auth.New(s.us, s.ss, mocks.NewTwoFAVerifierMock(mc), mocks.NewPasskeyVerifierMock(mc), 720*time.Hour)
	s.ctx = s.T().Context()
}

// session makes ValidateToken succeed for user u1 with the given hash.
func (s *VerifyPasswordSuite) session(hash string) {
	s.ss.GetMock.Expect(s.ctx, "tok").Return(domain.Session{UserID: "u1"}, nil)
	s.us.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1", PasswordHash: hash}, nil)
	s.us.ResolveOwningAdminMock.Expect(s.ctx, "u1").Return("", nil)
}

// A stolen cookie must not brute-force the password through step-up: once the
// budget is spent the check is refused as throttled without comparing, even for
// the right password.
func (s *VerifyPasswordSuite) TestBudgetSpentIsRefusedWithoutVerifying() {
	s.ss.GetMock.Expect(s.ctx, "tok").Return(domain.Session{UserID: "u1"}, nil)
	s.us.GetByIDMock.Return(domain.User{ID: "u1"}, nil)
	s.us.ResolveOwningAdminMock.Return("", nil)
	s.ss.TakeChangePasswordAttemptMock.Expect(s.ctx, "u1").Return(false, nil)

	ok, err := s.svc.VerifyPassword(s.ctx, "tok", "pw")

	assert.ErrorIs(s.T(), err, domain.ErrLoginThrottled)
	assert.Equal(s.T(), ok, false)
}

// A wrong password is a guess: it stays counted (no Refund, no Clear).
func (s *VerifyPasswordSuite) TestWrongPasswordStaysCounted() {
	hash, _ := password.Hash("pw")
	s.session(hash)
	s.ss.TakeChangePasswordAttemptMock.Expect(s.ctx, "u1").Return(true, nil)

	ok, err := s.svc.VerifyPassword(s.ctx, "tok", "WRONG")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), ok, false)
}

// An empty password is a wrong password (403 at the gateway), not a 400: it
// takes an attempt like any other guess.
func (s *VerifyPasswordSuite) TestEmptyPasswordIsAWrongGuess() {
	hash, _ := password.Hash("pw")
	s.session(hash)
	s.ss.TakeChangePasswordAttemptMock.Expect(s.ctx, "u1").Return(true, nil)

	ok, err := s.svc.VerifyPassword(s.ctx, "tok", "")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), ok, false)
}

func (s *VerifyPasswordSuite) TestRightPasswordClearsTheBudget() {
	hash, _ := password.Hash("pw")
	s.session(hash)
	s.ss.TakeChangePasswordAttemptMock.Expect(s.ctx, "u1").Return(true, nil)
	s.ss.ClearChangePasswordFailsMock.Expect(s.ctx, "u1").Return(nil)

	ok, err := s.svc.VerifyPassword(s.ctx, "tok", "pw")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), ok, true)
}

// A failure that is ours (the user row cannot be re-read) hands the attempt back.
func (s *VerifyPasswordSuite) TestStoreErrorRefundsTheAttempt() {
	boom := errors.New("db down")
	calls := 0
	s.ss.GetMock.Expect(s.ctx, "tok").Return(domain.Session{UserID: "u1"}, nil)
	s.us.ResolveOwningAdminMock.Expect(s.ctx, "u1").Return("", nil)
	s.us.GetByIDMock.Set(func(context.Context, string) (domain.User, error) {
		calls++
		if calls == 1 { // ValidateToken's hydration
			return domain.User{ID: "u1"}, nil
		}
		return domain.User{}, boom
	})
	s.ss.TakeChangePasswordAttemptMock.Expect(s.ctx, "u1").Return(true, nil)
	s.ss.RefundChangePasswordAttemptMock.Expect(s.ctx, "u1").Return(nil)

	_, err := s.svc.VerifyPassword(s.ctx, "tok", "pw")

	assert.ErrorIs(s.T(), err, boom)
}
