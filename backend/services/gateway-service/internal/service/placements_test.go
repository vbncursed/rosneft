package service_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
)

type PlacementsSuite struct {
	suite.Suite
	cat *fakeCatalog
	svc *service.Gateway
}

func TestPlacementsSuite(t *testing.T) {
	suite.Run(t, new(PlacementsSuite))
}

func (s *PlacementsSuite) SetupTest() {
	s.cat = newFakeCatalog()
	s.svc = service.New(s.cat, newFakeMesh(), &fakeUpload{})
}

func validPlacement() domain.Placement {
	return domain.Placement{
		TerritorySlug: "t1",
		ModelSlug:     "m1",
		Scale:         domain.Vec3{X: 1, Y: 1, Z: 1},
	}
}

func (s *PlacementsSuite) TestCreateRejectsEmptyTerritory() {
	p := validPlacement()
	p.TerritorySlug = ""
	_, err := s.svc.CreatePlacement(s.T().Context(), p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateRejectsEmptyModel() {
	p := validPlacement()
	p.ModelSlug = ""
	_, err := s.svc.CreatePlacement(s.T().Context(), p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateAppliesDefaultScaleOnZeroVec() {
	p := validPlacement()
	p.Scale = domain.Vec3{}
	out, err := s.svc.CreatePlacement(s.T().Context(), p)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), out.Scale, domain.Vec3{X: 1, Y: 1, Z: 1})
}

func (s *PlacementsSuite) TestCreateRejectsPartialZeroScale() {
	p := validPlacement()
	p.Scale = domain.Vec3{X: 2, Y: 0, Z: 0}
	_, err := s.svc.CreatePlacement(s.T().Context(), p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateRejectsNegativeScale() {
	p := validPlacement()
	p.Scale = domain.Vec3{X: -1, Y: 1, Z: 1}
	_, err := s.svc.CreatePlacement(s.T().Context(), p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestUpdateRejectsZeroID() {
	p := validPlacement()
	_, err := s.svc.UpdatePlacement(s.T().Context(), p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestUpdateRejectsNegativeScale() {
	p := validPlacement()
	p.ID = 1
	p.Scale = domain.Vec3{X: -1, Y: 1, Z: 1}
	_, err := s.svc.UpdatePlacement(s.T().Context(), p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestDeleteRejectsZeroID() {
	err := s.svc.DeletePlacement(s.T().Context(), 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestDeleteRejectsNegativeID() {
	err := s.svc.DeletePlacement(s.T().Context(), -1)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestListRejectsEmptySlug() {
	_, err := s.svc.ListPlacements(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}
