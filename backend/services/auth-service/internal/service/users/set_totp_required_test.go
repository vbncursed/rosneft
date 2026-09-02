package users_test

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users/mocks"
)

type SetTOTPRequiredSuite struct {
	suite.Suite
}

func TestSetTOTPRequiredSuite(t *testing.T) { suite.Run(t, new(SetTOTPRequiredSuite)) }

func (s *SetTOTPRequiredSuite) TestRequiresAndReturnsTheRefreshedUser() {
	mc := minimock.NewController(s.T())
	store := mocks.NewStoreMock(mc)
	svc := users.New(store, nil)
	ctx := s.T().Context()

	store.GetByIDMock.Expect(ctx, "u-1").Return(domain.User{ID: "u-1"}, nil)
	store.SetTOTPRequiredMock.Expect(ctx, "u-1", true).
		Return(domain.User{ID: "u-1", TOTPRequired: true}, nil)

	got, err := svc.SetTOTPRequired(ctx, "actor-1", true, "u-1", true)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.TOTPRequired, true)
}

// Requiring an account that is already required is the same state, not a
// transition, so it answers success rather than a conflict.
func (s *SetTOTPRequiredSuite) TestIsIdempotent() {
	mc := minimock.NewController(s.T())
	store := mocks.NewStoreMock(mc)
	svc := users.New(store, nil)
	ctx := s.T().Context()

	store.GetByIDMock.Expect(ctx, "u-1").Return(domain.User{ID: "u-1", TOTPRequired: true}, nil)
	store.SetTOTPRequiredMock.Expect(ctx, "u-1", true).
		Return(domain.User{ID: "u-1", TOTPRequired: true}, nil)

	got, err := svc.SetTOTPRequired(ctx, "actor-1", true, "u-1", true)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.TOTPRequired, true)
}
