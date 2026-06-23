package service_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
)

type PanoramaLabelSuite struct {
	suite.Suite
	repo *fakeRepo
	svc  *service.Catalog
}

func TestPanoramaLabelSuite(t *testing.T) {
	suite.Run(t, new(PanoramaLabelSuite))
}

func (s *PanoramaLabelSuite) SetupTest() {
	s.repo = newFakeRepo()
	s.svc = service.New(s.repo)
	s.repo.territories["t1"] = domain.Territory{Slug: "t1"}
	s.repo.panoramas[10] = domain.Panorama{ID: 10, TerritorySlug: "t1"}
	s.repo.placements[1] = domain.Placement{ID: 1, TerritorySlug: "t1", Scale: domain.Vec3{X: 1, Y: 1, Z: 1}}
}

func (s *PanoramaLabelSuite) TestRejectsEmptySlug() {
	_, err := s.svc.SetPlacementPanoramaLabel(s.T().Context(), "", 1, 10, "x")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PanoramaLabelSuite) TestRejectsZeroIDs() {
	_, err := s.svc.SetPlacementPanoramaLabel(s.T().Context(), "t1", 0, 10, "x")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	_, err = s.svc.SetPlacementPanoramaLabel(s.T().Context(), "t1", 1, 0, "x")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PanoramaLabelSuite) TestRejectsPanoramaNotOnTerritory() {
	_, err := s.svc.SetPlacementPanoramaLabel(s.T().Context(), "t1", 1, 999, "x")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PanoramaLabelSuite) TestUnknownPlacementNotFound() {
	_, err := s.svc.SetPlacementPanoramaLabel(s.T().Context(), "t1", 999, 10, "x")
	assert.Assert(s.T(), errors.Is(err, domain.ErrPlacementNotFound))
}

func (s *PanoramaLabelSuite) TestSetsLabel() {
	out, err := s.svc.SetPlacementPanoramaLabel(s.T().Context(), "t1", 1, 10, "Pump A")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out.PanoramaLabels), 1)
	assert.Equal(s.T(), out.PanoramaLabels[0].PanoramaID, int64(10))
	assert.Equal(s.T(), out.PanoramaLabels[0].Label, "Pump A")
}

func (s *PanoramaLabelSuite) TestEmptyLabelClears() {
	_, err := s.svc.SetPlacementPanoramaLabel(s.T().Context(), "t1", 1, 10, "Pump A")
	assert.NilError(s.T(), err)
	out, err := s.svc.SetPlacementPanoramaLabel(s.T().Context(), "t1", 1, 10, "")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out.PanoramaLabels), 0)
}
