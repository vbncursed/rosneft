package users_test

import (
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Scope tests extend UsersSuite (defined in users_test.go) — owner-scoped
// visibility of the user list and single-user fetches.

// No GetByID expectation in the List tests: the transport already knows
// whether the actor is Root, so a lookup would fail the controller.
func (s *UsersSuite) TestListScopedToOwner() {
	s.st.ListMock.Expect(s.ctx, "", false, "owner1", "owner1").Return([]domain.User{{ID: "u2"}}, nil)
	out, err := s.svc.List(s.ctx, "owner1", false, false, "", false)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 1)
}

// users:read_all widens the list to every user, except Root and the Company
// Owners: only Root sees those.
func (s *UsersSuite) TestListAllHidesPrivilegedFromNonRoot() {
	s.st.ListMock.Expect(s.ctx, "", false, "", "reader").Return([]domain.User{{ID: "a"}, {ID: "b"}}, nil)
	out, err := s.svc.List(s.ctx, "reader", false, true, "", false)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 2)
}

func (s *UsersSuite) TestListAllForRoot() {
	s.st.ListMock.Expect(s.ctx, "", false, "", "").Return([]domain.User{{ID: "a"}, {ID: "b"}}, nil)
	out, err := s.svc.List(s.ctx, "root", true, true, "", false)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 2)
}

func (s *UsersSuite) TestGetForeignUserHiddenFromOwner() {
	s.st.GetByIDMock.Expect(s.ctx, "u9").Return(domain.User{ID: "u9", CreatedBy: new("someoneelse")}, nil)
	_, err := s.svc.Get(s.ctx, "owner1", false, "u9")
	assert.ErrorIs(s.T(), err, domain.ErrUserNotFound)
}

// The owner's own account is created by Root, not by the owner — CreatedBy
// alone would hide it from a scoped Get exactly like a foreign user.
func (s *UsersSuite) TestGetSelfVisibleToOwner() {
	s.st.GetByIDMock.Expect(s.ctx, "owner1").Return(domain.User{ID: "owner1", CreatedBy: new("root")}, nil)
	u, err := s.svc.Get(s.ctx, "owner1", false, "owner1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), u.ID, "owner1")
}
