package service_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
)

type RescaleSuite struct {
	suite.Suite
	repo *fakeRepo
	svc  *service.Catalog
}

func TestRescaleSuite(t *testing.T) {
	suite.Run(t, new(RescaleSuite))
}

func (s *RescaleSuite) SetupTest() {
	s.repo = newFakeRepo()
	s.svc = service.New(s.repo)
}

func (s *RescaleSuite) TestSetBaselineRejectsEmptySlug() {
	err := s.svc.SetTerritoryRescaleBaseline(s.T().Context(), "", 4)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *RescaleSuite) TestSetBaselineRejectsNonPositiveMax() {
	err := s.svc.SetTerritoryRescaleBaseline(s.T().Context(), "t1", 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	err = s.svc.SetTerritoryRescaleBaseline(s.T().Context(), "t1", -2)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *RescaleSuite) TestSetBaselineDelegates() {
	err := s.svc.SetTerritoryRescaleBaseline(s.T().Context(), "t1", 10)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.repo.LastSetRescaleBaselineSlug, "t1")
	assert.Equal(s.T(), s.repo.LastSetRescaleBaselineMax, 10.0)
}

func (s *RescaleSuite) TestRescaleRejectsEmptySlug() {
	_, err := s.svc.RescaleTerritoryPlacements(s.T().Context(), "", 4)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *RescaleSuite) TestRescaleRejectsNonPositiveMax() {
	_, err := s.svc.RescaleTerritoryPlacements(s.T().Context(), "t1", 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *RescaleSuite) TestRescaleNoopWithoutBaseline() {
	s.repo.placements[1] = domain.Placement{ID: 1, TerritorySlug: "t1", Scale: domain.Vec3{X: 1, Y: 1, Z: 1}}
	n, err := s.svc.RescaleTerritoryPlacements(s.T().Context(), "t1", 5)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 0)
}

func (s *RescaleSuite) TestRescaleScalesPositionAndScaleThenClears() {
	s.repo.placements[1] = domain.Placement{
		ID: 1, TerritorySlug: "t1",
		Position: domain.Vec3{X: 1, Y: 2, Z: 3},
		Scale:    domain.Vec3{X: 0.5, Y: 0.5, Z: 0.5},
	}
	// old max 10, new max 5 → factor 2: the object keeps its real-world size
	// and location against the new mesh.
	assert.NilError(s.T(), s.svc.SetTerritoryRescaleBaseline(s.T().Context(), "t1", 10))
	n, err := s.svc.RescaleTerritoryPlacements(s.T().Context(), "t1", 5)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 1)
	got := s.repo.placements[1]
	assert.Equal(s.T(), got.Position, domain.Vec3{X: 2, Y: 4, Z: 6})
	assert.Equal(s.T(), got.Scale, domain.Vec3{X: 1, Y: 1, Z: 1})

	// Baseline cleared → a second rescale is a no-op.
	n, err = s.svc.RescaleTerritoryPlacements(s.T().Context(), "t1", 5)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 0)
}

func (s *RescaleSuite) TestSetBaselineWriteOncePreservesEarliest() {
	assert.NilError(s.T(), s.svc.SetTerritoryRescaleBaseline(s.T().Context(), "t1", 10))
	assert.NilError(s.T(), s.svc.SetTerritoryRescaleBaseline(s.T().Context(), "t1", 99)) // ignored
	s.repo.placements[1] = domain.Placement{
		ID: 1, TerritorySlug: "t1",
		Position: domain.Vec3{X: 1, Y: 1, Z: 1},
		Scale:    domain.Vec3{X: 1, Y: 1, Z: 1},
	}
	n, err := s.svc.RescaleTerritoryPlacements(s.T().Context(), "t1", 5)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 1)
	// Factor from the FIRST baseline (10/5 = 2), not the second (99).
	assert.Equal(s.T(), s.repo.placements[1].Position.X, 2.0)
}
