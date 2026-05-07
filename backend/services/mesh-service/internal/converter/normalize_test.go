package converter

import (
	"math"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type NormalizeSuite struct{ suite.Suite }

func TestNormalizeSuite(t *testing.T) { suite.Run(t, new(NormalizeSuite)) }

func (s *NormalizeSuite) TestCentersAtOrigin() {
	pts := []vertex{{0, 0, 0}, {10, 10, 10}}
	normalize(pts)
	// After centering, the midpoint should sit at the origin.
	for i := range 3 {
		assert.Equal(s.T(), pts[0][i]+pts[1][i], float32(0))
	}
}

func (s *NormalizeSuite) TestScalesMaxDimToTarget() {
	// Box from (0,0,0) to (10, 5, 2.5): maxDim = 10 → target = 2.
	pts := []vertex{{0, 0, 0}, {10, 5, 2.5}}
	normalize(pts)
	delta := pts[1][0] - pts[0][0]
	assert.Assert(s.T(), math.Abs(float64(delta)-targetMaxDimension) < 1e-5,
		"max dim X = %f, want %f", delta, targetMaxDimension)
}

func (s *NormalizeSuite) TestPreservesAspectRatio() {
	// 10:5:2.5 = 4:2:1.
	pts := []vertex{{0, 0, 0}, {10, 5, 2.5}}
	normalize(pts)
	dx := pts[1][0] - pts[0][0]
	dy := pts[1][1] - pts[0][1]
	dz := pts[1][2] - pts[0][2]
	assert.Assert(s.T(), math.Abs(float64(dx/dy)-2.0) < 1e-5, "dx/dy = %f, want 2", dx/dy)
	assert.Assert(s.T(), math.Abs(float64(dy/dz)-2.0) < 1e-5, "dy/dz = %f, want 2", dy/dz)
}

func (s *NormalizeSuite) TestReturnsOriginalBbox() {
	pts := []vertex{{1, 2, 3}, {7, 8, 9}}
	min, max := normalize(pts)
	assert.Equal(s.T(), min, vertex{1, 2, 3})
	assert.Equal(s.T(), max, vertex{7, 8, 9})
}

func (s *NormalizeSuite) TestEmpty() {
	min, max := normalize(nil)
	assert.Equal(s.T(), min, vertex{})
	assert.Equal(s.T(), max, vertex{})
}

func (s *NormalizeSuite) TestSinglePoint() {
	pts := []vertex{{5, 5, 5}}
	normalize(pts)
	// Single point has zero extent: scale stays 1, the point translates to origin.
	assert.Equal(s.T(), pts[0], vertex{0, 0, 0})
}

func (s *NormalizeSuite) TestFlatMesh() {
	// A planar mesh on the XY plane (z always 0). maxDim should pick the
	// largest non-zero axis and scale accordingly.
	pts := []vertex{{0, 0, 0}, {4, 0, 0}, {2, 4, 0}}
	normalize(pts)
	// Width along X = 4, height along Y = 4 → maxDim = 4 → scale = 0.5.
	dx := pts[1][0] - pts[0][0]
	assert.Assert(s.T(), math.Abs(float64(dx)-2.0) < 1e-5, "dx after scale = %f, want 2", dx)
}
