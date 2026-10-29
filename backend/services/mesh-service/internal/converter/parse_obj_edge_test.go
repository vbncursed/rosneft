package converter

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

// ParseOBJEdgeSuite pins the directive dispatch and the face grammar of
// parseOBJWithUp through its public entry, one observable result per case.
type ParseOBJEdgeSuite struct{ suite.Suite }

func TestParseOBJEdgeSuite(t *testing.T) { suite.Run(t, new(ParseOBJEdgeSuite)) }

const triVerts = "v 0 0 0\nv 1 0 0\nv 0 1 0\n"

func (s *ParseOBJEdgeSuite) TestCRLFAndIndentation() {
	obj := "mtllib a.mtl\r\n  v 0 0 0\r\n\tv 1 0 0\r\nv 0 1 0\r\nusemtl red\r\n\t f 1 2 3 \r\n\r\n"
	src, err := parseOBJ(strings.NewReader(obj))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), src.mtllib, "a.mtl")
	assert.Equal(s.T(), len(src.positions), 3)
	assert.Equal(s.T(), src.groups[0].name, "red")
	assert.Equal(s.T(), src.groups[0].triangles[0], triangle{0, 1, 2})
}

func (s *ParseOBJEdgeSuite) TestDirectiveSpelling() {
	tests := []struct {
		name      string
		obj       string
		positions int
		uvs       int
		mtllib    string
		groups    []string
	}{
		{"v with tab separator is not a vertex", "v\t1 2 3\n", 0, 0, "", nil},
		{
			"vt with tab separator is a uv",
			triVerts + "vt\t0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3\n",
			3,
			3,
			"",
			[]string{""},
		},
		{"vtx is not vt", triVerts + "vtx 0 0\nf 1 2 3\n", 3, 0, "", []string{""}},
		{"bare vt is skipped", triVerts + "vt\nf 1 2 3\n", 3, 0, "", []string{""}},
		{"mtllib with tab", "mtllib\tb.mtl\n", 0, 0, "b.mtl", nil},
		{"first mtllib wins", "mtllib one.mtl\nmtllib two.mtl\n", 0, 0, "one.mtl", nil},
		{"bare usemtl is ignored", triVerts + "usemtl\nf 1 2 3\n", 3, 0, "", []string{""}},
		{"usemtl with tab", triVerts + "usemtl\tm\nf 1 2 3\n", 3, 0, "", []string{"m"}},
		{"usemtl name is trimmed", triVerts + "usemtl  blue paint \nf 1 2 3\n", 3, 0, "", []string{"blue paint"}},
		{
			"g o s vn l p are skipped",
			"g a\no b\ns 1\nvn 0 0 1\nl 1 2\np 1\n" + triVerts + "f 1 2 3\n",
			3,
			0,
			"",
			[]string{""},
		},
	}
	for _, tt := range tests {
		s.Run(tt.name, func() {
			src, err := parseOBJ(strings.NewReader(tt.obj))
			assert.NilError(s.T(), err)
			assert.Equal(s.T(), len(src.positions), tt.positions)
			assert.Equal(s.T(), len(src.uvs), tt.uvs)
			assert.Equal(s.T(), src.mtllib, tt.mtllib)
			var names []string
			for _, g := range src.groups {
				names = append(names, g.name)
			}
			assert.DeepEqual(s.T(), names, tt.groups)
		})
	}
}

func (s *ParseOBJEdgeSuite) TestFacesBeforeUsemtlGoToUnnamedGroup() {
	obj := triVerts + "f 1 2 3\nusemtl m\nf 1 2 3\n"
	src, err := parseOBJ(strings.NewReader(obj))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(src.groups), 2)
	assert.Equal(s.T(), src.groups[0].name, "")
	assert.Equal(s.T(), src.groups[1].name, "m")
}

func (s *ParseOBJEdgeSuite) TestFaceIndexForms() {
	uvVerts := triVerts + "vt 0 0\nvt 1 0\nvt 0 1\n"
	tests := []struct {
		name   string
		obj    string
		tri    triangle
		hasUVs bool
	}{
		{"negative vt", uvVerts + "f 1/-3 2/-2 3/-1\n", triangle{0, 1, 2}, true},
		{"negative v and vt", uvVerts + "f -3/-3 -2/-2 -1/-1\n", triangle{0, 1, 2}, true},
		{"trailing slash means no uv", uvVerts + "f 1/ 2/ 3/\n", triangle{0, 1, 2}, false},
		{"mixed uv and no uv drops uvs", uvVerts + "f 1/1 2 3/3\n", triangle{0, 1, 2}, false},
		{"vt lines but faces without uv", uvVerts + "f 1 2 3\n", triangle{0, 1, 2}, false},
		{"trailing whitespace", triVerts + "f 1 2 3 \t \n", triangle{0, 1, 2}, false},
		{"tab between tokens", triVerts + "f 1\t2\t3\n", triangle{0, 1, 2}, false},
		{"repeated vertex shares output index", triVerts + "f 1 2 1\n", triangle{0, 1, 0}, false},
	}
	for _, tt := range tests {
		s.Run(tt.name, func() {
			src, err := parseOBJ(strings.NewReader(tt.obj))
			assert.NilError(s.T(), err)
			assert.Equal(s.T(), src.groups[0].triangles[0], tt.tri)
			assert.Equal(s.T(), src.hasUVs, tt.hasUVs)
			assert.Equal(s.T(), src.uvs == nil, !tt.hasUVs)
		})
	}
}

func (s *ParseOBJEdgeSuite) TestOutputUVsFollowFaceReferences() {
	obj := triVerts + "vt 0.5 0.25\nvt 0 0\nvt 1 1\nf 1/3 2/1 3/2\n"
	src, err := parseOBJ(strings.NewReader(obj))
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), src.uvs, []uv{{1, 0}, {0.5, 0.75}, {0, 1}})
}

func (s *ParseOBJEdgeSuite) TestPolygonFansShareThePivot() {
	obj := "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 2 0\nv 1 2 0\nf 1 2 3 4 5 6\n"
	src, err := parseOBJ(strings.NewReader(obj))
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), src.groups[0].triangles,
		[]triangle{{0, 1, 2}, {0, 2, 3}, {0, 3, 4}, {0, 4, 5}})
}

func (s *ParseOBJEdgeSuite) TestErrors() {
	uvVerts := triVerts + "vt 0 0\nvt 1 0\nvt 0 1\n"
	tests := []struct {
		name string
		obj  string
		want string
	}{
		{"vertex with two components", "v 1 2\n", "vertex line 1"},
		{"second vertex reports its number", "v 1 2 3\nv 1 x 3\n", "vertex line 2"},
		{"uv with one component", "vt 0.5\n", "uv line 1"},
		{"uv garbage", "vt a b\n", "uv line 1"},
		{"face v garbage", triVerts + "f a 2 3\n", "face v index"},
		{"face v out of range", triVerts + "f 1 2 4\n", "out of range"},
		{"face negative v out of range", triVerts + "f -4 1 2\n", "out of range"},
		{"face vt garbage", uvVerts + "f 1/x 2/2 3/3\n", "face vt index"},
		{"face vt out of range", uvVerts + "f 1/1 2/2 3/4\n", "face vt index 4 out of range"},
		{"face vt zero", uvVerts + "f 1/0 2/2 3/3\n", "face vt index 0 out of range"},
		{"face negative vt out of range", uvVerts + "f 1/-4 2/2 3/3\n", "out of range"},
		{"face vt without any vt line", triVerts + "f 1/1 2/1 3/1\n", "face vt index 1 out of range"},
		{"empty face", triVerts + "f \n", "needs >=3"},
		{"two index face", triVerts + "f 1 2\n", "needs >=3"},
		{"face before vertices", "f 1 2 3\n", "out of range"},
		{"line over the scanner limit", "#" + strings.Repeat("x", 1<<24), "scan"},
	}
	for _, tt := range tests {
		s.Run(tt.name, func() {
			_, err := parseOBJ(strings.NewReader(tt.obj))
			assert.ErrorContains(s.T(), err, tt.want)
			assert.ErrorContains(s.T(), err, "parseOBJ")
		})
	}
}
