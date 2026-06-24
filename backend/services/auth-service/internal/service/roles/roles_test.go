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
	svc    *roles.Service
	st     *mocks.StoreMock
	actors *mocks.ActorsMock
	ctx    context.Context
}

func TestRolesSuite(t *testing.T) {
	suite.Run(t, new(RolesSuite))
}

func (s *RolesSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.st = mocks.NewStoreMock(mc)
	s.actors = mocks.NewActorsMock(mc)
	s.svc = roles.New(s.st, mocks.NewPermsMock(mc), s.actors)
	s.ctx = s.T().Context()
}

func (s *RolesSuite) TestCreateRejectsEmptySlug() {
	_, err := s.svc.Create(s.ctx, "actor", "", "Title", nil)
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

// A non-owner cannot create a role carrying a permission it does not hold.
func (s *RolesSuite) TestCreateBlocksEscalation() {
	s.actors.GetByIDMock.Expect(s.ctx, "editor").Return(domain.User{ID: "editor", Permissions: []string{"placement:write"}}, nil)
	_, err := s.svc.Create(s.ctx, "editor", "super", "Super", []string{"territory:write"})
	assert.ErrorIs(s.T(), err, domain.ErrPrivilegeEscalation)
}

// The owner bypasses the subset check entirely.
func (s *RolesSuite) TestCreateOwnerBypasses() {
	s.actors.GetByIDMock.Expect(s.ctx, "owner").Return(domain.User{ID: "owner", IsOwner: true}, nil)
	s.st.CreateMock.Return(domain.Role{Slug: "super"}, nil)
	r, err := s.svc.Create(s.ctx, "owner", "super", "Super", []string{"territory:write"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), r.Slug, "super")
}

// SetPermissions is the other escalation vector and is guarded the same way.
func (s *RolesSuite) TestSetPermissionsBlocksEscalation() {
	s.actors.GetByIDMock.Expect(s.ctx, "editor").Return(domain.User{ID: "editor", Permissions: []string{"placement:write"}}, nil)
	_, err := s.svc.SetPermissions(s.ctx, "editor", "viewer", []string{"model:delete"})
	assert.ErrorIs(s.T(), err, domain.ErrPrivilegeEscalation)
}
