package users_test

import (
	"context"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users/mocks"
)

type ChangePasswordSuite struct {
	suite.Suite
	svc *users.Service
	st  *mocks.StoreMock
	ss  *mocks.SessionsMock
	ctx context.Context
}

func TestChangePasswordSuite(t *testing.T) {
	suite.Run(t, new(ChangePasswordSuite))
}

func (s *ChangePasswordSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.st = mocks.NewStoreMock(mc)
	s.ss = mocks.NewSessionsMock(mc)
	s.svc = users.New(s.st, s.ss)
	s.ctx = s.T().Context()
}

// A locked caller is refused before the password is ever verified: GetByID
// must never be reached, which minimock enforces by failing the test on an
// unconfigured call.
func (s *ChangePasswordSuite) TestChangePasswordRefusesWhenLocked() {
	s.ss.IsChangePasswordLockedMock.Expect(s.ctx, "u1").Return(true, nil)

	err := s.svc.ChangePassword(s.ctx, "u1", "old", "NewPassw0rd!")

	assert.ErrorIs(s.T(), err, domain.ErrLoginThrottled)
}

func (s *ChangePasswordSuite) TestChangePasswordRegistersFailOnWrongOldPassword() {
	hash, err := password.Hash("correct-horse")
	assert.NilError(s.T(), err)

	s.ss.IsChangePasswordLockedMock.Expect(s.ctx, "u1").Return(false, nil)
	s.st.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1", PasswordHash: hash}, nil)
	s.ss.RegisterChangePasswordFailMock.Expect(s.ctx, "u1").Return(nil)

	err = s.svc.ChangePassword(s.ctx, "u1", "wrong-password", "NewPassw0rd!")

	assert.ErrorIs(s.T(), err, domain.ErrInvalidCredential)
}

func (s *ChangePasswordSuite) TestChangePasswordClearsFailsAndChangesOnSuccess() {
	hash, err := password.Hash("correct-horse")
	assert.NilError(s.T(), err)

	s.ss.IsChangePasswordLockedMock.Expect(s.ctx, "u1").Return(false, nil)
	s.st.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1", PasswordHash: hash}, nil)
	s.ss.ClearChangePasswordFailsMock.Expect(s.ctx, "u1").Return(nil)
	s.st.ChangePasswordMock.Set(func(_ context.Context, id, newHash string) error {
		assert.Equal(s.T(), id, "u1")
		ok, verr := password.Verify("NewPassw0rd!", newHash)
		assert.NilError(s.T(), verr)
		assert.Assert(s.T(), ok)
		return nil
	})

	err = s.svc.ChangePassword(s.ctx, "u1", "correct-horse", "NewPassw0rd!")

	assert.NilError(s.T(), err)
}
