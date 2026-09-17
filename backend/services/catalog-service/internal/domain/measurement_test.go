package domain_test

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

type MeasurementPointsSuite struct {
	suite.Suite
}

func TestMeasurementPointsSuite(t *testing.T) { suite.Run(t, new(MeasurementPointsSuite)) }

func (s *MeasurementPointsSuite) TestFlattenPointsKeepsXYZOrder() {
	flat := domain.FlattenPoints([]domain.Vec3{{X: 1, Y: 2, Z: 3}, {X: 4, Y: 5, Z: 6}})
	assert.DeepEqual(s.T(), flat, []float64{1, 2, 3, 4, 5, 6})
}

func (s *MeasurementPointsSuite) TestPointsFromFlatRebuildsTriples() {
	points, err := domain.PointsFromFlat([]float64{1, 2, 3, 4, 5, 6})
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), points, []domain.Vec3{{X: 1, Y: 2, Z: 3}, {X: 4, Y: 5, Z: 6}})
}

func (s *MeasurementPointsSuite) TestPointsFromFlatRejectsARaggedTail() {
	for _, flat := range [][]float64{{1}, {1, 2}, {1, 2, 3, 4}} {
		_, err := domain.PointsFromFlat(flat)
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	}
}

func (s *MeasurementPointsSuite) TestEmptyRoundTripsAsEmpty() {
	points, err := domain.PointsFromFlat(nil)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(points), 0)
	assert.Equal(s.T(), len(domain.FlattenPoints(nil)), 0)
}
