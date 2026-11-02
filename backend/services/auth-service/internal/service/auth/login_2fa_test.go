package auth_test

import (
	"time"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// An account frozen between the password step and the TOTP step gets no session.
func (s *LoginSuite) TestLoginVerify2FAFrozenAfterPasswordStep() {
	s.ss.TakePendingMock.Expect(s.ctx, "ch").Return("u1", int64(0), nil)
	s.tf.VerifyMock.Expect(s.ctx, "u1", "123456").Return(true, nil)
	s.us.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1", Status: domain.StatusFrozen}, nil)

	_, err := s.svc.LoginVerify2FA(s.ctx, "ch", "123456")
	assert.ErrorIs(s.T(), err, domain.ErrAccountFrozen)
}

// A challenge issued before a password change must not turn into a session
// after it: the password it was issued under is gone.
func (s *LoginSuite) TestLoginVerify2FARefusedAfterPasswordChange() {
	changed := time.UnixMicro(2000).UTC()
	s.ss.TakePendingMock.Expect(s.ctx, "ch").Return("u1", int64(1000), nil)
	s.tf.VerifyMock.Expect(s.ctx, "u1", "123456").Return(true, nil)
	s.us.GetByIDMock.Expect(s.ctx, "u1").
		Return(domain.User{ID: "u1", Status: domain.StatusActive, PasswordChangedAt: &changed}, nil)

	token, err := s.svc.LoginVerify2FA(s.ctx, "ch", "123456")
	assert.ErrorIs(s.T(), err, domain.ErrTwoFAInvalidCode)
	assert.Equal(s.T(), token, "")
}

func (s *LoginSuite) TestLoginVerify2FAWithUnchangedEpochIssues() {
	changed := time.UnixMicro(2000).UTC()
	s.ss.TakePendingMock.Expect(s.ctx, "ch").Return("u1", int64(2000), nil)
	s.tf.VerifyMock.Expect(s.ctx, "u1", "123456").Return(true, nil)
	s.us.GetByIDMock.Expect(s.ctx, "u1").
		Return(domain.User{ID: "u1", Status: domain.StatusActive, PasswordChangedAt: &changed}, nil)
	s.ss.CreateMock.Return("tok", nil)

	token, err := s.svc.LoginVerify2FA(s.ctx, "ch", "123456")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), token, "tok")
}

// A challenge from before the deploy carries no epoch (0) and is let through.
func (s *LoginSuite) TestLoginVerify2FALegacyChallengeIsUnchecked() {
	changed := time.UnixMicro(2000).UTC()
	s.ss.TakePendingMock.Expect(s.ctx, "ch").Return("u1", int64(0), nil)
	s.tf.VerifyMock.Expect(s.ctx, "u1", "123456").Return(true, nil)
	s.us.GetByIDMock.Expect(s.ctx, "u1").
		Return(domain.User{ID: "u1", Status: domain.StatusActive, PasswordChangedAt: &changed}, nil)
	s.ss.CreateMock.Return("tok", nil)

	_, err := s.svc.LoginVerify2FA(s.ctx, "ch", "123456")
	assert.NilError(s.T(), err)
}
