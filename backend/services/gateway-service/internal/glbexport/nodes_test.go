package glbexport

import (
	"math"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type NodesSuite struct{ suite.Suite }

func TestNodesSuite(t *testing.T) { suite.Run(t, new(NodesSuite)) }

// The expected quaternions were produced once with three.js:
// new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ')).
func (s *NodesSuite) TestQuatFromEulerXYZMatchesThree() {
	cases := []struct {
		name    string
		x, y, z float64
		want    [4]float64
	}{
		{"mixed signs", 0.3, -1.2, 2.5, [4]float64{-0.49092935835291807, -0.29308970064231238, 0.74782934426836634, 0.33739896907924444}},
		{"quarter turn about x", math.Pi / 2, 0, 0, [4]float64{0.70710678118654746, 0, 0, 0.70710678118654757}},
		{"identity", 0, 0, 0, [4]float64{0, 0, 0, 1}},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			got := quatFromEulerXYZ(tc.x, tc.y, tc.z)
			for i := range got {
				assert.Assert(s.T(), math.Abs(got[i]-tc.want[i]) < 1e-12, "component %d: got %v want %v", i, got, tc.want)
			}
		})
	}
}
