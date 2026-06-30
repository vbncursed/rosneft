package users_test

import (
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Grant tests extend UsersSuite (defined in users_test.go): no-privilege-
// escalation on role assignment, and the owner-flag guard.

// A non-owner cannot assign a role conferring permissions it does not hold.
func (s *UsersSuite) TestUpdateBlocksRoleEscalation() {
	s.st.GetByIDMock.When(s.ctx, "u2").Then(domain.User{ID: "u2"}, nil)
	s.st.GetByIDMock.When(s.ctx, "editor").Then(domain.User{ID: "editor", Permissions: []string{"placement:write"}}, nil)
	s.st.PermissionsForRolesMock.Expect(s.ctx, []string{"admin"}).Return([]string{"territory:write", "users:write"}, nil)

	_, err := s.svc.Update(s.ctx, "editor", true, "u2", []string{"admin"}, "", "")
	assert.ErrorIs(s.T(), err, domain.ErrPrivilegeEscalation)
}

// The owner bypasses the subset check and the assignment goes through.
func (s *UsersSuite) TestUpdateOwnerAssignsAdmin() {
	s.st.GetByIDMock.When(s.ctx, "u2").Then(domain.User{ID: "u2"}, nil)
	s.st.GetByIDMock.When(s.ctx, "owner").Then(domain.User{ID: "owner", IsOwner: true}, nil)
	s.st.SetRolesMock.Expect(s.ctx, "u2", []string{"admin"}).Return(domain.User{ID: "u2", RoleSlugs: []string{"admin"}}, nil)

	out, err := s.svc.Update(s.ctx, "owner", true, "u2", []string{"admin"}, "", "")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.RoleSlugs[0], "admin")
}

// Removing every role must reach SetRoles — an empty proto repeated arrives as
// nil, which the old guard wrongly treated as "no change".
func (s *UsersSuite) TestUpdateClearsAllRoles() {
	s.st.GetByIDMock.When(s.ctx, "u2").Then(domain.User{ID: "u2", RoleSlugs: []string{"editor"}}, nil)
	s.st.SetRolesMock.Expect(s.ctx, "u2", nil).Return(domain.User{ID: "u2"}, nil)

	out, err := s.svc.Update(s.ctx, "owner", true, "u2", nil, "", "")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out.RoleSlugs), 0)
}

func (s *UsersSuite) TestSetOwnerRejectsSelf() {
	_, err := s.svc.SetOwner(s.ctx, "u1", "u1", true)
	assert.ErrorIs(s.T(), err, domain.ErrSelfTarget)
}

func (s *UsersSuite) TestSetOwnerRejectsNonOwner() {
	s.st.GetByIDMock.Expect(s.ctx, "actor").Return(domain.User{ID: "actor", IsOwner: false}, nil)
	_, err := s.svc.SetOwner(s.ctx, "actor", "u2", true)
	assert.ErrorIs(s.T(), err, domain.ErrOwnerOnly)
}

func (s *UsersSuite) TestSetOwnerGrantsWhenOwner() {
	s.st.GetByIDMock.When(s.ctx, "owner").Then(domain.User{ID: "owner", IsOwner: true}, nil)
	s.st.GetByIDMock.When(s.ctx, "u2").Then(domain.User{ID: "u2"}, nil)
	s.st.SetOwnerMock.Expect(s.ctx, "u2", true).Return(domain.User{ID: "u2", IsOwner: true}, nil)

	out, err := s.svc.SetOwner(s.ctx, "owner", "u2", true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.IsOwner, true)
}
