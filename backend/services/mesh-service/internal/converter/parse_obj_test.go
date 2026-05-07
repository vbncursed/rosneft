package converter

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type ParseOBJSuite struct{ suite.Suite }

func TestParseOBJSuite(t *testing.T) { suite.Run(t, new(ParseOBJSuite)) }

func (s *ParseOBJSuite) TestBasicTriangle() {
	obj := "v 1 2 3\nv 4 5 6\nv 7 8 9\nf 1 2 3\n"
	src, err := parseOBJ(strings.NewReader(obj))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(src.positions), 3)
	assert.Equal(s.T(), len(src.groups[0].triangles), 1)
	assert.Equal(s.T(), src.hasUVs, false)
	// Z-up→Y-up: (1,2,3) → (1,3,-2)
	assert.Equal(s.T(), src.positions[0], vertex{1, 3, -2})
	assert.Equal(s.T(), src.groups[0].triangles[0], triangle{0, 1, 2})
}

func (s *ParseOBJSuite) TestQuadFanTriangulation() {
	obj := "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n"
	src, err := parseOBJ(strings.NewReader(obj))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(src.groups[0].triangles), 2)
	assert.Equal(s.T(), src.groups[0].triangles[0], triangle{0, 1, 2})
	assert.Equal(s.T(), src.groups[0].triangles[1], triangle{0, 2, 3})
}

func (s *ParseOBJSuite) TestNgonTriangulation() {
	obj := "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0.5 1.5 0\nv 0 1 0\nf 1 2 3 4 5\n"
	src, err := parseOBJ(strings.NewReader(obj))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(src.groups[0].triangles), 3)
	assert.Equal(s.T(), src.groups[0].triangles[0], triangle{0, 1, 2})
	assert.Equal(s.T(), src.groups[0].triangles[1], triangle{0, 2, 3})
	assert.Equal(s.T(), src.groups[0].triangles[2], triangle{0, 3, 4})
}

func (s *ParseOBJSuite) TestNegativeIndices() {
	obj := "v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n"
	src, err := parseOBJ(strings.NewReader(obj))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(src.groups[0].triangles), 1)
	assert.Equal(s.T(), src.groups[0].triangles[0], triangle{0, 1, 2})
}

func (s *ParseOBJSuite) TestFaceFormats() {
	cases := map[string]struct {
		obj    string
		hasUVs bool
	}{
		"plain":   {"v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n", false},
		"v_vt":    {"v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3\n", true},
		"v_vt_vn": {"v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nvn 0 0 1\nf 1/1/1 2/2/1 3/3/1\n", true},
		"v__vn":   {"v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 1\nf 1//1 2//1 3//1\n", false},
	}
	for name, tc := range cases {
		s.Run(name, func() {
			src, err := parseOBJ(strings.NewReader(tc.obj))
			assert.NilError(s.T(), err)
			assert.Equal(s.T(), len(src.groups[0].triangles), 1)
			assert.Equal(s.T(), src.groups[0].triangles[0], triangle{0, 1, 2})
			assert.Equal(s.T(), src.hasUVs, tc.hasUVs)
		})
	}
}

func (s *ParseOBJSuite) TestUVsParsedAndVFlipped() {
	// OBJ uv (0.25, 0.75) → glTF uv (0.25, 0.25).
	obj := "v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0.25 0.75\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3\n"
	src, err := parseOBJ(strings.NewReader(obj))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), src.hasUVs, true)
	assert.Equal(s.T(), len(src.uvs), 3)
	assert.Equal(s.T(), src.uvs[0], uv{0.25, 0.25})
	assert.Equal(s.T(), src.uvs[1], uv{1, 1})
	assert.Equal(s.T(), src.uvs[2], uv{0, 0})
}

func (s *ParseOBJSuite) TestSamePositionDifferentUVsDeduped() {
	// Two faces share v=1 but with different vt → output emits two vertices.
	obj := `v 0 0 0
v 1 0 0
v 0 1 0
v 1 1 0
vt 0 0
vt 0.5 0.5
vt 1 0
vt 0 1
f 1/1 2/3 3/4
f 1/2 4/3 3/4
`
	src, err := parseOBJ(strings.NewReader(obj))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), src.hasUVs, true)
	// Unique (v,vt) pairs: (1,1), (2,3), (3,4), (1,2), (4,3) = 5.
	assert.Equal(s.T(), len(src.positions), 5)
	assert.Equal(s.T(), len(src.uvs), 5)
}

func (s *ParseOBJSuite) TestSkipsCommentsAndBlanks() {
	obj := "# comment\n\n   \nv 0 0 0\n# v 99 99 99\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"
	src, err := parseOBJ(strings.NewReader(obj))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(src.positions), 3)
	assert.Equal(s.T(), len(src.groups[0].triangles), 1)
}

func (s *ParseOBJSuite) TestSkipsUnknownDirectives() {
	obj := `mtllib foo.mtl
o ObjectName
g Group1
s 1
vn 0 0 1
vt 0.5 0.5
v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 3
`
	src, err := parseOBJ(strings.NewReader(obj))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(src.positions), 3)
	assert.Equal(s.T(), len(src.groups[0].triangles), 1)
}

func (s *ParseOBJSuite) TestIndexOutOfRange() {
	obj := "v 0 0 0\nf 1 2 3\n"
	_, err := parseOBJ(strings.NewReader(obj))
	assert.ErrorContains(s.T(), err, "out of range")
}

func (s *ParseOBJSuite) TestZeroIndexRejected() {
	obj := "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 0 1 2\n"
	_, err := parseOBJ(strings.NewReader(obj))
	assert.ErrorContains(s.T(), err, "out of range")
}

func (s *ParseOBJSuite) TestFaceTooFewVertices() {
	obj := "v 0 0 0\nv 1 0 0\nf 1 2\n"
	_, err := parseOBJ(strings.NewReader(obj))
	assert.ErrorContains(s.T(), err, "needs >=3")
}

func (s *ParseOBJSuite) TestVertexMalformed() {
	obj := "v 1 not_a_number 3\n"
	_, err := parseOBJ(strings.NewReader(obj))
	assert.Assert(s.T(), err != nil)
}

func (s *ParseOBJSuite) TestEmpty() {
	src, err := parseOBJ(strings.NewReader(""))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(src.positions), 0)
	assert.Equal(s.T(), len(src.groups), 0)
	assert.Equal(s.T(), src.hasUVs, false)
}

func (s *ParseOBJSuite) TestUsemtlSplitsIntoGroups() {
	obj := `v 0 0 0
v 1 0 0
v 0 1 0
v 1 1 0
usemtl alpha
f 1 2 3
usemtl beta
f 2 4 3
usemtl alpha
f 1 4 2
`
	src, err := parseOBJ(strings.NewReader(obj))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(src.groups), 2)
	assert.Equal(s.T(), src.groups[0].name, "alpha")
	assert.Equal(s.T(), len(src.groups[0].triangles), 2)
	assert.Equal(s.T(), src.groups[1].name, "beta")
	assert.Equal(s.T(), len(src.groups[1].triangles), 1)
}

func (s *ParseOBJSuite) TestMtllibCaptured() {
	obj := "mtllib foo bar.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"
	src, err := parseOBJ(strings.NewReader(obj))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), src.mtllib, "foo bar.mtl")
}

func (s *ParseOBJSuite) TestVertexWithFourComponents() {
	obj := "v 1 2 3 1.0\n"
	src, err := parseOBJ(strings.NewReader(obj))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(src.positions), 0) // no faces → no output positions
	// objPositions parsed but only emitted via face refs.
	_ = src
}
