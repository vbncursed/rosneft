package auth_test

import (
	"errors"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// A member sees its Company Owner's territories, not ones keyed to its own id:
// the key is what ValidateToken would put on its session.
func (s *ValidateTokenSuite) TestTerritoryScopeOfAMemberIsItsCompanyOwner() {
	s.us.ResolveOwningAdminMock.Expect(s.ctx, "m1").Return("co-b", nil)

	got, err := s.svc.TerritoryScope(s.ctx, domain.User{ID: "m1", RoleSlugs: []string{"viewer"}})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got, "co-b")
}

func (s *ValidateTokenSuite) TestTerritoryScopeOfAGuestIsItself() {
	s.us.ResolveOwningAdminMock.Expect(s.ctx, "g1").Return("co-b", nil)

	got, err := s.svc.TerritoryScope(s.ctx, domain.User{ID: "g1", RoleSlugs: []string{"guest"}})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got, "g1")
}

func (s *ValidateTokenSuite) TestTerritoryScopePassesALookupFailureOn() {
	boom := errors.New("postgres is down")
	s.us.ResolveOwningAdminMock.Expect(s.ctx, "m1").Return("", boom)

	_, err := s.svc.TerritoryScope(s.ctx, domain.User{ID: "m1"})
	assert.ErrorIs(s.T(), err, boom)
}
