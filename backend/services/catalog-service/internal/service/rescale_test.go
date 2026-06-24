package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service/mocks"
)

// The service layer only validates and delegates: the rescale arithmetic
// (factor = oldMax/newMax, write-once baseline, clear-after-apply) is a
// Postgres CTE living in internal/storage. Those mechanics belong in a storage
// integration test, not here — the previous in-memory fake re-implemented the
// CTE, so its math assertions were testing the fake, not the service.
type RescaleSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Catalog
	ctx  context.Context
}

func TestRescaleSuite(t *testing.T) {
	suite.Run(t, new(RescaleSuite))
}

func (s *RescaleSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo)
	s.ctx = s.T().Context()
}

func (s *RescaleSuite) TestSetBaselineRejectsEmptySlug() {
	err := s.svc.SetTerritoryRescaleBaseline(s.ctx, "", 4)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *RescaleSuite) TestSetBaselineRejectsNonPositiveMax() {
	err := s.svc.SetTerritoryRescaleBaseline(s.ctx, "t1", 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	err = s.svc.SetTerritoryRescaleBaseline(s.ctx, "t1", -2)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *RescaleSuite) TestSetBaselineDelegates() {
	s.repo.SetTerritoryRescaleBaselineMock.Expect(s.ctx, "t1", 10.0).Return(nil)
	err := s.svc.SetTerritoryRescaleBaseline(s.ctx, "t1", 10)
	assert.NilError(s.T(), err)
}

func (s *RescaleSuite) TestRescaleRejectsEmptySlug() {
	_, err := s.svc.RescaleTerritoryPlacements(s.ctx, "", 4)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *RescaleSuite) TestRescaleRejectsNonPositiveMax() {
	_, err := s.svc.RescaleTerritoryPlacements(s.ctx, "t1", 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *RescaleSuite) TestRescaleDelegatesAndReturnsCount() {
	s.repo.RescaleTerritoryPlacementsMock.Expect(s.ctx, "t1", 5.0).Return(3, nil)
	n, err := s.svc.RescaleTerritoryPlacements(s.ctx, "t1", 5)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 3)
}
