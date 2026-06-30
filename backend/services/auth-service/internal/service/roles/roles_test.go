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

func (s *RolesSuite) TestCreateRejectsEmptyTitle() {
	_, err := s.svc.Create(s.ctx, "actor", "", "", "", nil)
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

// An omitted slug is derived from the title (slug is now internal-only).
func (s *RolesSuite) TestCreateDerivesSlugFromTitle() {
	s.actors.GetByIDMock.Expect(s.ctx, "owner").Return(domain.User{ID: "owner", IsOwner: true}, nil)
	s.st.CreateMock.Expect(s.ctx, domain.Role{Slug: "company-owner", Title: "Company Owner"}).
		Return(domain.Role{Slug: "company-owner", Title: "Company Owner"}, nil)
	r, err := s.svc.Create(s.ctx, "owner", "", "", "Company Owner", nil)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), r.Slug, "company-owner")
}

// Create stamps the role with the creator's group so List can scope it.
func (s *RolesSuite) TestCreateStampsOwnerAdmin() {
	s.actors.GetByIDMock.Expect(s.ctx, "mgr").Return(domain.User{ID: "mgr", IsOwner: true}, nil)
	s.st.CreateMock.Expect(s.ctx, domain.Role{Slug: "x", Title: "X", OwnerAdminID: "admin-1"}).
		Return(domain.Role{Slug: "x"}, nil)
	_, err := s.svc.Create(s.ctx, "mgr", "admin-1", "x", "X", nil)
	assert.NilError(s.T(), err)
}

// List forwards the caller's group scope to the store.
func (s *RolesSuite) TestListForwardsScope() {
	s.st.ListMock.Expect(s.ctx, "admin-1", false).Return([]domain.Role{{Slug: "x"}}, nil)
	out, err := s.svc.List(s.ctx, "admin-1", false)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 1)
}

// Delete forwards the caller's group scope (the store enforces ownership).
func (s *RolesSuite) TestDeleteForwardsScope() {
	s.st.DeleteMock.Expect(s.ctx, "x", "admin-1", false).Return(nil)
	assert.NilError(s.T(), s.svc.Delete(s.ctx, "x", "admin-1", false))
}

// A non-owner cannot create a role carrying a permission it does not hold.
func (s *RolesSuite) TestCreateBlocksEscalation() {
	s.actors.GetByIDMock.Expect(s.ctx, "editor").Return(domain.User{ID: "editor", Permissions: []string{"placement:write"}}, nil)
	_, err := s.svc.Create(s.ctx, "editor", "", "super", "Super", []string{"territory:write"})
	assert.ErrorIs(s.T(), err, domain.ErrPrivilegeEscalation)
}

// The owner bypasses the subset check entirely.
func (s *RolesSuite) TestCreateOwnerBypasses() {
	s.actors.GetByIDMock.Expect(s.ctx, "owner").Return(domain.User{ID: "owner", IsOwner: true}, nil)
	s.st.CreateMock.Return(domain.Role{Slug: "super"}, nil)
	r, err := s.svc.Create(s.ctx, "owner", "", "super", "Super", []string{"territory:write"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), r.Slug, "super")
}

// SetPermissions is the other escalation vector and is guarded the same way.
func (s *RolesSuite) TestSetPermissionsBlocksEscalation() {
	s.actors.GetByIDMock.Expect(s.ctx, "editor").Return(domain.User{ID: "editor", Permissions: []string{"placement:write"}}, nil)
	_, err := s.svc.SetPermissions(s.ctx, "editor", "viewer", []string{"model:delete"}, "", false)
	assert.ErrorIs(s.T(), err, domain.ErrPrivilegeEscalation)
}
