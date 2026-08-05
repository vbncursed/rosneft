package passkey_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/service/passkey"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/service/passkey/mocks"
)

type ManageSuite struct {
	suite.Suite
	store *mocks.StoreMock
	svc   *passkey.Service
	ctx   context.Context
}

func TestManageSuite(t *testing.T) {
	suite.Run(t, new(ManageSuite))
}

func (s *ManageSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.store = mocks.NewStoreMock(mc)
	s.svc = passkey.New(s.store, mocks.NewCeremoniesMock(mc), mocks.NewEngineMock(mc))
	s.ctx = s.T().Context()
}

// The admin user list needs "has at least one passkey", not the credentials
// themselves — a user with two keys is one id in the answer, not two.
func (s *ManageSuite) TestCredentialedUsersReturnsOnlyUsersThatHaveOne() {
	s.store.UsersWithCredentialsMock.Expect(s.ctx, []string{"a", "b"}).Return([]string{"a"}, nil)

	got, err := s.svc.CredentialedUsers(s.ctx, []string{"a", "b"})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, []string{"a"})
}

// An empty batch must not reach the database. The gateway calls this on every
// admin list render, including one with no rows to show.
func (s *ManageSuite) TestCredentialedUsersSkipsTheStoreOnAnEmptyBatch() {
	got, err := s.svc.CredentialedUsers(s.ctx, nil)

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got == nil)
}

// A store failure is not "nobody has a passkey" — it is no answer at all, and
// the caller has to be able to tell the difference.
func (s *ManageSuite) TestCredentialedUsersPropagatesTheStoreError() {
	s.store.UsersWithCredentialsMock.Expect(s.ctx, []string{"a"}).Return(nil, errors.New("db down"))

	_, err := s.svc.CredentialedUsers(s.ctx, []string{"a"})

	assert.ErrorContains(s.T(), err, "db down")
}
