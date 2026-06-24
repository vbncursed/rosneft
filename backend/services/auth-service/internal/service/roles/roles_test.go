package roles_test

import (
	"context"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/roles"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/roles/mocks"
)

type RolesSuite struct {
	suite.Suite
	svc *roles.Service
	ctx context.Context
}

func TestRolesSuite(t *testing.T) {
	suite.Run(t, new(RolesSuite))
}

func (s *RolesSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.svc = roles.New(mocks.NewStoreMock(mc), mocks.NewPermsMock(mc))
	s.ctx = s.T().Context()
}

func (s *RolesSuite) TestCreateRejectsEmptySlug() {
	_, err := s.svc.Create(s.ctx, "", "Title", nil)
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}
