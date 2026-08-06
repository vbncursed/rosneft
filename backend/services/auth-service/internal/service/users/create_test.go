package users_test

import (
	"context"
	"strings"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Create tests extend UsersSuite (defined in users_test.go).

// A mixed-case, whitespace-padded address must reach the store folded — the
// citext column would compare it case-insensitively either way, but the stored
// and displayed form has to be the normalized one.
func (s *UsersSuite) TestCreateFoldsEmail() {
	var got string
	s.st.CreateMock.Set(func(_ context.Context, u domain.User) (domain.User, error) {
		got = u.Email
		return domain.User{ID: "u1", Email: u.Email}, nil
	})

	_, err := s.svc.Create(s.ctx, "admin", "  Ernest.Sayapov@Gmail.COM ", "ernest", "Passw0rd!", nil)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got, "ernest.sayapov@gmail.com")
}

// Folding must happen before validation, not after. mail.ParseAddress tolerates
// surrounding whitespace on its own, so the only place the ordering is
// observable is the RFC 5321 length ceiling: an address of exactly 254
// characters is 258 with padding, and validate.Email rejects it unless the trim
// has already run.
func (s *UsersSuite) TestCreateFoldsBeforeValidating() {
	atCeiling := strings.Repeat("a", 248) + "@b.com" // 254 characters
	s.st.CreateMock.Set(func(_ context.Context, u domain.User) (domain.User, error) {
		return domain.User{ID: "u1", Email: u.Email}, nil
	})

	_, err := s.svc.Create(s.ctx, "admin", "  "+atCeiling+"  ", "ernest", "Passw0rd!", nil)
	assert.NilError(s.T(), err)
}

// A padded username must be trimmed on the way in. Login folds the identifier,
// and citext ignores case but not whitespace — so a stored " ivan " could never
// be matched by the folded "ivan", leaving the account impossible to log into.
func (s *UsersSuite) TestCreateTrimsUsername() {
	var got string
	s.st.CreateMock.Set(func(_ context.Context, u domain.User) (domain.User, error) {
		got = u.Username
		return domain.User{ID: "u1", Username: u.Username}, nil
	})

	_, err := s.svc.Create(s.ctx, "admin", "ernest@gmail.com", "  Ernest  ", "Passw0rd!", nil)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got, "Ernest")
}
