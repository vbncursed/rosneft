package users_test

import (
	"context"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users/mocks"
)

type UsersSuite struct {
	suite.Suite
	svc *users.Service
	st  *mocks.StoreMock
	ss  *mocks.SessionsMock
	ctx context.Context
}

func TestUsersSuite(t *testing.T) {
	suite.Run(t, new(UsersSuite))
}

func (s *UsersSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.st = mocks.NewStoreMock(mc)
	s.ss = mocks.NewSessionsMock(mc)
	s.svc = users.New(s.st, s.ss)
	s.ctx = s.T().Context()
}

func (s *UsersSuite) TestFreezeRejectsSelf() {
	s.st.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1"}, nil)
	_, err := s.svc.Freeze(s.ctx, "u1", true, "u1")
	assert.ErrorIs(s.T(), err, domain.ErrSelfTarget)
}

func (s *UsersSuite) TestFreezeRejectsLastAdmin() {
	s.st.GetByIDMock.When(s.ctx, "admin1").Then(domain.User{ID: "admin1", RoleSlugs: []string{"admin"}}, nil)
	s.st.GetByIDMock.When(s.ctx, "owner").Then(domain.User{ID: "owner", IsOwner: true}, nil)
	s.st.CountAdminsMock.Expect(s.ctx, "admin1").Return(0, nil)

	_, err := s.svc.Freeze(s.ctx, "owner", true, "admin1")
	assert.ErrorIs(s.T(), err, domain.ErrLastAdmin)
}

// A non-owner (even an admin) cannot freeze/delete an admin account.
func (s *UsersSuite) TestFreezeRejectsNonOwnerManagingAdmin() {
	s.st.GetByIDMock.When(s.ctx, "admin1").Then(domain.User{ID: "admin1", RoleSlugs: []string{"admin"}}, nil)
	s.st.GetByIDMock.When(s.ctx, "actor").Then(domain.User{ID: "actor", RoleSlugs: []string{"admin"}}, nil)

	_, err := s.svc.Freeze(s.ctx, "actor", true, "admin1")
	assert.ErrorIs(s.T(), err, domain.ErrAdminOwnerOnly)
}

func (s *UsersSuite) TestFreezeKillsSessions() {
	s.st.GetByIDMock.Expect(s.ctx, "u2").Return(domain.User{ID: "u2", RoleSlugs: []string{"editor"}}, nil)
	s.st.SetStatusMock.Return(domain.User{ID: "u2", Status: domain.StatusFrozen}, nil)
	s.ss.DeleteUserMock.Expect(s.ctx, "u2").Return(nil)

	out, err := s.svc.Freeze(s.ctx, "actor", true, "u2")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Status, domain.StatusFrozen)
}
