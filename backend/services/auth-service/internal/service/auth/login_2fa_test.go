package auth_test

import (
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// An account frozen between the password step and the TOTP step gets no session.
func (s *LoginSuite) TestLoginVerify2FAFrozenAfterPasswordStep() {
	s.ss.TakePendingMock.Expect(s.ctx, "ch").Return("u1", nil)
	s.tf.VerifyMock.Expect(s.ctx, "u1", "123456").Return(true, nil)
	s.us.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1", Status: domain.StatusFrozen}, nil)

	_, err := s.svc.LoginVerify2FA(s.ctx, "ch", "123456")
	assert.ErrorIs(s.T(), err, domain.ErrAccountFrozen)
}
