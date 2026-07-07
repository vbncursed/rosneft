package auth_test

import (
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

func (s *LoginSuite) TestPasskeyLoginFinishSuccess() {
	s.pk.FinishLoginMock.Expect(s.ctx, "flow", "{}").Return("u1", nil)
	s.us.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1", Status: domain.StatusActive}, nil)
	s.ss.CreateMock.Return("tok123", nil)

	token, err := s.svc.PasskeyLoginFinish(s.ctx, "flow", "{}")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), token, "tok123")
}

func (s *LoginSuite) TestPasskeyLoginFinishFrozen() {
	// Create must NOT be called for a frozen account.
	s.pk.FinishLoginMock.Expect(s.ctx, "flow", "{}").Return("u1", nil)
	s.us.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1", Status: domain.StatusFrozen}, nil)

	_, err := s.svc.PasskeyLoginFinish(s.ctx, "flow", "{}")
	assert.ErrorIs(s.T(), err, domain.ErrAccountFrozen)
}

func (s *LoginSuite) TestPasskeyLoginFinishEmptyInput() {
	_, err := s.svc.PasskeyLoginFinish(s.ctx, "", "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}
