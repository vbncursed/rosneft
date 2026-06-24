package users_test

import (
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Scope tests extend UsersSuite (defined in users_test.go) — owner-scoped
// visibility of the user list and single-user fetches.

func (s *UsersSuite) TestListScopedToOwner() {
	s.st.ListMock.Expect(s.ctx, "", false, "owner1").Return([]domain.User{{ID: "u2"}}, nil)
	out, err := s.svc.List(s.ctx, "owner1", false, "", false)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 1)
}

func (s *UsersSuite) TestListAllForAdmin() {
	s.st.ListMock.Expect(s.ctx, "", false, "").Return([]domain.User{{ID: "a"}, {ID: "b"}}, nil)
	out, err := s.svc.List(s.ctx, "admin1", true, "", false)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 2)
}

func (s *UsersSuite) TestGetForeignUserHiddenFromOwner() {
	other := "someoneelse"
	s.st.GetByIDMock.Expect(s.ctx, "u9").Return(domain.User{ID: "u9", CreatedBy: &other}, nil)
	_, err := s.svc.Get(s.ctx, "owner1", false, "u9")
	assert.ErrorIs(s.T(), err, domain.ErrUserNotFound)
}
