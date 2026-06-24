package twofa_test

import (
	"context"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/twofa"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/twofa/mocks"
)

type TwoFASuite struct {
	suite.Suite
	st  *mocks.StoreMock
	svc *twofa.Service
	ctx context.Context
}

func TestTwoFASuite(t *testing.T) {
	suite.Run(t, new(TwoFASuite))
}

func (s *TwoFASuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.st = mocks.NewStoreMock(mc)
	s.svc = twofa.New(s.st, mocks.NewRecoveryMock(mc), mocks.NewCipherMock(mc), "Andrey")
	s.ctx = s.T().Context()
}

func (s *TwoFASuite) TestEnableRejectsWhenAlreadyOn() {
	s.st.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1", TOTPEnabled: true}, nil)
	_, err := s.svc.Enable(s.ctx, "u1", "123456")
	assert.ErrorIs(s.T(), err, domain.Err2FAAlreadyEnabled)
}
