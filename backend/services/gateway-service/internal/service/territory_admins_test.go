package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
)

type TerritoryAdminsSuite struct {
	suite.Suite
	cat *mocks.CatalogMock
	svc *service.Gateway
	ctx context.Context
}

func TestTerritoryAdminsSuite(t *testing.T) { suite.Run(t, new(TerritoryAdminsSuite)) }

func (s *TerritoryAdminsSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.cat = mocks.NewCatalogMock(mc)
	s.svc = service.New(s.cat, mocks.NewContentMock(mc), mocks.NewMeshMock(mc), mocks.NewUploadMock(mc), mocks.NewAuditMock(mc), mocks.NewAuthMock(mc))
	s.ctx = s.T().Context()
}

// The access screen reads a missing key as "not loaded", so a territory nobody
// is assigned to must answer [] rather than vanish.
func (s *TerritoryAdminsSuite) TestEveryVisibleTerritoryGetsAKey() {
	s.cat.ListTerritoriesMock.Expect(s.ctx, "admin-a", false).Return([]domain.Territory{{Slug: "a"}, {Slug: "b"}}, nil)
	s.cat.ListTerritoryAdminsMock.Expect(s.ctx, []string{"a", "b"}).Return(map[string][]string{"a": {"u1"}}, nil)

	got, err := s.svc.ListTerritoryAdmins(s.ctx, "admin-a", false)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, map[string][]string{"a": {"u1"}, "b": {}})
}

func (s *TerritoryAdminsSuite) TestACatalogFailureIsNotAnEmptyAnswer() {
	boom := errors.New("catalog down")
	s.cat.ListTerritoriesMock.Expect(s.ctx, "", false).Return(nil, boom)

	_, err := s.svc.ListTerritoryAdmins(s.ctx, "", true)
	assert.ErrorIs(s.T(), err, boom)
}

// To the catalog an empty scope means every territory, so a scoped caller whose
// admin id did not resolve must see none, and the catalog is never asked: the
// controller would panic on an unexpected call.
func (s *TerritoryAdminsSuite) TestAScopedCallerWithoutAnAdminSeesNothing() {
	got, err := s.svc.ListTerritoryAdmins(s.ctx, "", false)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, map[string][]string{})
}

// A failure of the second read is not an empty answer either.
func (s *TerritoryAdminsSuite) TestAFailedAdminReadIsNotAnEmptyAnswer() {
	boom := errors.New("catalog down")
	s.cat.ListTerritoriesMock.Expect(s.ctx, "", false).Return([]domain.Territory{{Slug: "a"}}, nil)
	s.cat.ListTerritoryAdminsMock.Expect(s.ctx, []string{"a"}).Return(nil, boom)

	_, err := s.svc.ListTerritoryAdmins(s.ctx, "", true)
	assert.ErrorIs(s.T(), err, boom)
}

// Nothing visible, nothing to ask: ListTerritoryAdmins is not expected, so the
// controller would fail the test on a call with an empty slug list.
func (s *TerritoryAdminsSuite) TestNoVisibleTerritorySkipsTheAdminRead() {
	s.cat.ListTerritoriesMock.Expect(s.ctx, "admin-a", false).Return(nil, nil)

	got, err := s.svc.ListTerritoryAdmins(s.ctx, "admin-a", false)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, map[string][]string{})
}
