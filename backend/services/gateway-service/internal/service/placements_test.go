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

type PlacementsSuite struct {
	suite.Suite
	cat *mocks.CatalogMock
	svc *service.Gateway
	ctx context.Context
}

func TestPlacementsSuite(t *testing.T) {
	suite.Run(t, new(PlacementsSuite))
}

func (s *PlacementsSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.cat = mocks.NewCatalogMock(mc)
	s.svc = service.New(s.cat, mocks.NewMeshMock(mc), mocks.NewUploadMock(mc))
	s.ctx = s.T().Context()
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
	_, err := s.svc.CreatePlacement(s.ctx, p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateRejectsEmptyModel() {
	p := validPlacement()
	p.ModelSlug = ""
	_, err := s.svc.CreatePlacement(s.ctx, p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateAppliesDefaultScaleOnZeroVec() {
	p := validPlacement()
	p.Scale = domain.Vec3{}
	forwarded := validPlacement() // gateway fills scale → {1,1,1} before forwarding
	s.cat.CreatePlacementMock.Expect(s.ctx, forwarded).Return(forwarded, nil)
	out, err := s.svc.CreatePlacement(s.ctx, p)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), out.Scale, domain.Vec3{X: 1, Y: 1, Z: 1})
}

func (s *PlacementsSuite) TestCreateRejectsPartialZeroScale() {
	p := validPlacement()
	p.Scale = domain.Vec3{X: 2, Y: 0, Z: 0}
	_, err := s.svc.CreatePlacement(s.ctx, p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestCreateRejectsNegativeScale() {
	p := validPlacement()
	p.Scale = domain.Vec3{X: -1, Y: 1, Z: 1}
	_, err := s.svc.CreatePlacement(s.ctx, p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestUpdateRejectsZeroID() {
	p := validPlacement()
	_, err := s.svc.UpdatePlacement(s.ctx, p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestUpdateRejectsNegativeScale() {
	p := validPlacement()
	p.ID = 1
	p.Scale = domain.Vec3{X: -1, Y: 1, Z: 1}
	_, err := s.svc.UpdatePlacement(s.ctx, p)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestDeleteRejectsZeroID() {
	err := s.svc.DeletePlacement(s.ctx, 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestDeleteRejectsNegativeID() {
	err := s.svc.DeletePlacement(s.ctx, -1)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *PlacementsSuite) TestListRejectsEmptySlug() {
	_, err := s.svc.ListPlacements(s.ctx, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}
