package service

import (
	"context"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service/mocks"
)

// White-box suite exercising rescaleAfterConvert directly, without driving the
// full ProcessJob path (which needs a converter).
type RescaleAfterConvertSuite struct {
	suite.Suite
	cat *mocks.CatalogMock
	m   *Mesh
	ctx context.Context
}

func TestRescaleAfterConvertSuite(t *testing.T) {
	suite.Run(t, new(RescaleAfterConvertSuite))
}

func (s *RescaleAfterConvertSuite) SetupTest() {
	s.cat = mocks.NewCatalogMock(minimock.NewController(s.T()))
	s.m = New(Config{Catalog: s.cat})
	s.ctx = s.T().Context()
}

// lod0Result is a LOD0 result whose source bbox has longest axis = 10.
func lod0Result() []domain.ConversionResult {
	return []domain.ConversionResult{{BBoxMax: domain.Vec3{X: 10, Y: 2, Z: 5}}}
}

func (s *RescaleAfterConvertSuite) TestTerritoryRescalesWithLOD0MaxAxis() {
	s.cat.RescaleTerritoryPlacementsMock.Expect(s.ctx, "t1", 10.0).Return(nil)
	err := s.m.rescaleAfterConvert(s.ctx, domain.KindTerritory, "t1", lod0Result())
	assert.NilError(s.T(), err)
}

func (s *RescaleAfterConvertSuite) TestModelDoesNotRescale() {
	// No Rescale expectation → any call would fail the test.
	err := s.m.rescaleAfterConvert(s.ctx, domain.KindModel, "m1", lod0Result())
	assert.NilError(s.T(), err)
}

func (s *RescaleAfterConvertSuite) TestDegenerateBboxSkipsRescale() {
	err := s.m.rescaleAfterConvert(s.ctx, domain.KindTerritory, "t1", []domain.ConversionResult{{}})
	assert.NilError(s.T(), err)
}
