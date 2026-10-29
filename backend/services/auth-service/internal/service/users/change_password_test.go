package users_test

import (
	"context"
	"errors"
	"testing"
	"time"

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
	s.ss.TakeChangePasswordAttemptMock.Expect(s.ctx, "u1").Return(false, nil)

	err := s.svc.ChangePassword(s.ctx, "u1", "tok", "old", "NewPassw0rd!")

	assert.ErrorIs(s.T(), err, domain.ErrLoginThrottled)
}

func (s *ChangePasswordSuite) TestChangePasswordRegistersFailOnWrongOldPassword() {
	hash, err := password.Hash("correct-horse")
	assert.NilError(s.T(), err)

	s.ss.TakeChangePasswordAttemptMock.Expect(s.ctx, "u1").Return(true, nil)
	s.st.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1", PasswordHash: hash}, nil)

	err = s.svc.ChangePassword(s.ctx, "u1", "tok", "wrong-password", "NewPassw0rd!")

	assert.ErrorIs(s.T(), err, domain.ErrInvalidCredential)
}

func (s *ChangePasswordSuite) TestChangePasswordClearsFailsAndChangesOnSuccess() {
	hash, err := password.Hash("correct-horse")
	assert.NilError(s.T(), err)

	s.ss.TakeChangePasswordAttemptMock.Expect(s.ctx, "u1").Return(true, nil)
	s.st.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1", PasswordHash: hash}, nil)
	s.ss.ClearChangePasswordFailsMock.Expect(s.ctx, "u1").Return(nil)
	s.ss.DeleteUserExceptMock.Expect(s.ctx, "u1", "tok").Return(nil)
	s.ss.SetPasswordEpochMock.Return(nil)
	s.st.ChangePasswordMock.Set(func(_ context.Context, id, newHash string, _ time.Time) error {
		assert.Equal(s.T(), id, "u1")
		ok, verr := password.Verify("NewPassw0rd!", newHash)
		assert.NilError(s.T(), verr)
		assert.Assert(s.T(), ok)
		return nil
	})

	err = s.svc.ChangePassword(s.ctx, "u1", "tok", "correct-horse", "NewPassw0rd!")

	assert.NilError(s.T(), err)
}

// The caller's own session is moved to the new epoch BEFORE the row changes,
// and to the very value the row is stamped with: between the two there is no
// instant at which the session making the change is older than the user.
func (s *ChangePasswordSuite) TestChangePasswordMovesOwnSessionToTheStampedEpochFirst() {
	hash, err := password.Hash("correct-horse")
	assert.NilError(s.T(), err)
	var steps []string
	var epoch int64
	var stamped time.Time
	s.ss.TakeChangePasswordAttemptMock.Return(true, nil)
	s.st.GetByIDMock.Return(domain.User{ID: "u1", PasswordHash: hash}, nil)
	s.ss.ClearChangePasswordFailsMock.Return(nil)
	s.ss.DeleteUserExceptMock.Return(nil)
	s.ss.SetPasswordEpochMock.Set(func(_ context.Context, token string, e int64) error {
		assert.Equal(s.T(), token, "tok")
		steps, epoch = append(steps, "session"), e
		return nil
	})
	s.st.ChangePasswordMock.Set(func(_ context.Context, _, _ string, at time.Time) error {
		steps, stamped = append(steps, "row"), at
		return nil
	})
	var forgotten []string
	s.svc.OnPasswordChange(func(id string) { forgotten = append(forgotten, id) })

	assert.NilError(s.T(), s.svc.ChangePassword(s.ctx, "u1", "tok", "correct-horse", "NewPassw0rd!"))

	assert.DeepEqual(s.T(), steps, []string{"session", "row"})
	assert.Equal(s.T(), epoch, stamped.UnixMicro())
	assert.Assert(s.T(), epoch > domain.NeverChangedEpoch)
	assert.DeepEqual(s.T(), forgotten, []string{"u1"})
}

// If the caller's session cannot be moved, nothing has changed yet: the error
// is returned and the password stays as it was.
func (s *ChangePasswordSuite) TestChangePasswordStopsBeforeTheRowWhenSessionCannotBeMoved() {
	hash, err := password.Hash("correct-horse")
	assert.NilError(s.T(), err)
	boom := errors.New("redis down")
	s.ss.TakeChangePasswordAttemptMock.Return(true, nil)
	s.st.GetByIDMock.Return(domain.User{ID: "u1", PasswordHash: hash}, nil)
	s.ss.SetPasswordEpochMock.Return(boom)

	err = s.svc.ChangePassword(s.ctx, "u1", "tok", "correct-horse", "NewPassw0rd!")

	assert.ErrorIs(s.T(), err, boom)
}

// The new epoch already refuses the other sessions, so the sweep failing after
// the hash is stored is cleanup, not a failure: a 5xx would only tempt a retry
// that can no longer verify the old password.
func (s *ChangePasswordSuite) TestChangePasswordSucceedsWhenCleanupFails() {
	hash, err := password.Hash("correct-horse")
	assert.NilError(s.T(), err)
	s.ss.TakeChangePasswordAttemptMock.Expect(s.ctx, "u1").Return(true, nil)
	s.st.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1", PasswordHash: hash}, nil)
	s.ss.SetPasswordEpochMock.Return(nil)
	s.st.ChangePasswordMock.Return(nil)
	s.ss.ClearChangePasswordFailsMock.Expect(s.ctx, "u1").Return(nil)
	s.ss.DeleteUserExceptMock.Expect(s.ctx, "u1", "tok").Return(errors.New("redis down"))

	err = s.svc.ChangePassword(s.ctx, "u1", "tok", "correct-horse", "NewPassw0rd!")

	assert.NilError(s.T(), err)
}
