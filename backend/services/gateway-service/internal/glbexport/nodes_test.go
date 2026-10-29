package glbexport

import (
	"math"
	"testing"

	"github.com/qmuntal/gltf"
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
		{
			"mixed signs",
			0.3,
			-1.2,
			2.5,
			[4]float64{-0.49092935835291807, -0.29308970064231238, 0.74782934426836634, 0.33739896907924444},
		},
		{"quarter turn about x", math.Pi / 2, 0, 0, [4]float64{0.70710678118654746, 0, 0, 0.70710678118654757}},
		{"identity", 0, 0, 0, [4]float64{0, 0, 0, 1}},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			got := QuatFromEulerXYZ(tc.x, tc.y, tc.z)
			for i := range got {
				assert.Assert(
					s.T(),
					math.Abs(got[i]-tc.want[i]) < 1e-12,
					"component %d: got %v want %v",
					i,
					got,
					tc.want,
				)
			}
		})
	}
}

// Every refusal copySubtree makes, through Build. The cases that fail on two
// counts pin the order: range, depth, reached twice, camera or skin, mesh.
func (s *NodesSuite) TestCopySubtreeRefusals() {
	deepLast := func(d *gltf.Document) {
		chain(maxDepth + 1)(d)
		d.Nodes[maxDepth].Camera = new(0)
	}
	cases := []struct {
		name   string
		mutate func(d *gltf.Document)
		want   error
		msg    string
	}{
		{
			"scene root out of range",
			func(d *gltf.Document) { d.Scenes[0].Nodes = []int{5} },
			ErrMalformed,
			"glbexport: malformed glb: node 5 out of range [0, 1)",
		},
		{
			"negative child",
			func(d *gltf.Document) { d.Nodes[0].Children = []int{-1} },
			ErrMalformed,
			"glbexport: malformed glb: node -1 out of range [0, 1)",
		},
		{
			"child one past the end",
			func(d *gltf.Document) { d.Nodes[0].Children = []int{1} },
			ErrMalformed,
			"glbexport: malformed glb: node 1 out of range [0, 1)",
		},
		{
			"cycle",
			func(d *gltf.Document) { d.Nodes[0].Children = []int{0} },
			ErrMalformed,
			"glbexport: malformed glb: node 0 reached twice",
		},
		{
			"two parents",
			func(d *gltf.Document) {
				d.Nodes = append(d.Nodes, &gltf.Node{}, &gltf.Node{})
				d.Nodes[0].Children = []int{1, 2}
				d.Nodes[1].Children = []int{2}
			},
			ErrMalformed,
			"glbexport: malformed glb: node 2 reached twice",
		},
		{
			"camera",
			func(d *gltf.Document) { d.Nodes[0].Camera = new(0) },
			ErrUnsupported,
			"glbexport: unsupported glTF feature: node 0 uses a camera or skin",
		},
		{
			"skin",
			func(d *gltf.Document) { d.Nodes[0].Skin = new(0) },
			ErrUnsupported,
			"glbexport: unsupported glTF feature: node 0 uses a camera or skin",
		},
		{
			"mesh one past the end",
			func(d *gltf.Document) { d.Nodes[0].Mesh = new(1) },
			ErrMalformed,
			"glbexport: malformed glb: mesh 1 out of range [0, 1)",
		},
		{
			"camera is refused before the mesh is looked at",
			func(d *gltf.Document) { d.Nodes[0].Camera, d.Nodes[0].Mesh = new(0), new(9) },
			ErrUnsupported,
			"glbexport: unsupported glTF feature: node 0 uses a camera or skin",
		},
		{
			"depth is refused before reached twice",
			func(d *gltf.Document) { chain(maxDepth)(d); d.Nodes[maxDepth-1].Children = []int{0} },
			ErrMalformed,
			"glbexport: malformed glb: node tree deeper than 256",
		},
		{
			"depth is refused before camera",
			deepLast,
			ErrMalformed,
			"glbexport: malformed glb: node tree deeper than 256",
		},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			doc, bin := triangleDoc()
			tc.mutate(doc)
			h := Head{Doc: doc, BinLength: int64(len(bin) + len(bin)%4)}

			_, err := Build([]Placement{place("x", "x")}, map[string]Head{"x": h})

			assert.ErrorIs(s.T(), err, tc.want)
			assert.ErrorContains(s.T(), err, tc.msg)
		})
	}
}
