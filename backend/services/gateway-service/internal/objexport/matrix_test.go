package objexport

import (
	"math"
	"math/rand/v2"
	"strconv"
	"strings"
	"testing"

	"github.com/qmuntal/gltf"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

type MatrixSuite struct{ suite.Suite }

func TestMatrixSuite(t *testing.T) { suite.Run(t, new(MatrixSuite)) }

// bake exports one triangle whose first vertex is p (the others sit at the
// origin) and returns its OBJ. pl and d tweak the placement and the document.
func (s *MatrixSuite) bake(p [3]float32, uv [][2]float32, opts Options, pl func(*glbexport.Placement), d func(*gltf.Document)) string {
	m := tri(p, [3]float32{}, [3]float32{})
	m.uv = uv
	doc, bin := docOf(m)
	if d != nil {
		d(doc)
	}
	placement := place("terr", "Terr")
	if pl != nil {
		pl(&placement)
	}
	obj, _ := objOf(s.T(), []glbexport.Placement{placement}, map[string][]byte{"terr": glbOf(s.T(), doc, bin)}, opts)
	return obj
}

// line returns the first OBJ line starting with prefix.
func line(obj, prefix string) string {
	for l := range strings.SplitSeq(obj, "\n") {
		if strings.HasPrefix(l, prefix) {
			return l
		}
	}
	return ""
}

func (s *MatrixSuite) TestIdentityTerritory() {
	obj := s.bake([3]float32{1, 2, 3}, nil, testOpts(), nil, nil)

	assert.Equal(s.T(), line(obj, "v "), "v 1 -3 2")
}

func (s *MatrixSuite) TestRatioScales() {
	opts := testOpts()
	opts.Ratio = 332.125

	obj := s.bake([3]float32{1, 2, 3}, nil, opts, nil, nil)

	assert.Equal(s.T(), line(obj, "v "), "v 332.125 -996.375 664.25")
}

// parseV reads the three numbers of a v line.
func (s *MatrixSuite) parseV(l string) [3]float64 {
	f := strings.Fields(l)
	assert.Equal(s.T(), len(f), 4, l)
	var out [3]float64
	for i := range out {
		v, err := strconv.ParseFloat(f[i+1], 64)
		assert.NilError(s.T(), err, l)
		out[i] = v
	}
	return out
}

func (s *MatrixSuite) near(l string, want [3]float64) {
	got := s.parseV(l)
	for i := range got {
		assert.Assert(s.T(), math.Abs(got[i]-want[i]) < 1e-6, "%s want %v", l, want)
	}
}

func (s *MatrixSuite) TestRotationXMovesYToZ() {
	obj := s.bake([3]float32{0, 1, 0}, nil, testOpts(), func(p *glbexport.Placement) { p.Rotation = [3]float64{math.Pi / 2, 0, 0} }, nil)

	l := line(obj, "v ")
	assert.Assert(s.T(), !strings.Contains(l, "e"), l)
	s.near(l, [3]float64{0, -1, 0})
}

func (s *MatrixSuite) TestEulerOrderIsXYZ() {
	obj := s.bake([3]float32{1, 0, 0}, nil, testOpts(), func(p *glbexport.Placement) { p.Rotation = [3]float64{math.Pi / 2, 0, math.Pi / 2} }, nil)

	s.near(line(obj, "v "), [3]float64{0, -1, 0})
}

func (s *MatrixSuite) TestNonUniformScaleAndTranslation() {
	obj := s.bake([3]float32{1, 1, 1}, nil, testOpts(), func(p *glbexport.Placement) {
		p.Translation = [3]float64{10, 20, 30}
		p.Scale = [3]float64{2, 1, 3}
	}, nil)

	assert.Equal(s.T(), line(obj, "v "), "v 12 -33 21")
}

func (s *MatrixSuite) TestMirroredNodeReversesFaces() {
	uv := [][2]float32{{0, 0}, {1, 0}, {0, 1}}

	obj := s.bake([3]float32{1, 2, 3}, uv, testOpts(), nil, func(d *gltf.Document) { d.Nodes[0].Scale = [3]float64{-1, 1, 1} })

	assert.Equal(s.T(), line(obj, "v "), "v -1 -3 2")
	assert.Equal(s.T(), line(obj, "f "), "f 3/3 2/2 1/1")
}

func (s *MatrixSuite) TestChildComposesUnderParent() {
	obj := s.bake([3]float32{1, 0, 0}, nil, testOpts(), nil, func(d *gltf.Document) {
		d.Nodes = []*gltf.Node{
			{Name: "parent", Translation: [3]float64{1, 0, 0}, Children: []int{1}},
			{Name: "child", Scale: [3]float64{2, 2, 2}, Mesh: new(0)},
		}
	})

	assert.Equal(s.T(), line(obj, "v "), "v 3 0 0")
}

func (s *MatrixSuite) TestNodeMatrix() {
	obj := s.bake([3]float32{}, nil, testOpts(), nil, func(d *gltf.Document) {
		d.Nodes[0].Matrix = [16]float64{1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 5, 1}
	})

	assert.Equal(s.T(), line(obj, "v "), "v 0 -5 0")
}

func (s *MatrixSuite) TestUVFlip() {
	uv := [][2]float32{{0.25, 0.75}, {0, 0}, {0, 0}}

	obj := s.bake([3]float32{}, uv, testOpts(), nil, nil)

	assert.Equal(s.T(), line(obj, "vt "), "vt 0.25 0.25")
}

func (s *MatrixSuite) TestNegativeZeroIsWrittenAsZero() {
	assert.Equal(s.T(), string(appendNum(nil, math.Copysign(0, -1))), "0")
	assert.Equal(s.T(), string(appendNum(nil, -1e-50)), "0") // underflows float32
}

// Every sum of products below is spelled with float64(...) around each product,
// which forbids fusing. arm64 fuses a*b+c without it and amd64 does not, so a
// matrix would differ in its last bit, and so would the OBJ text printed from it.
func (s *MatrixSuite) TestArithmeticIsUnfused() {
	rnd := rand.New(rand.NewPCG(1, 2))
	num := func() float64 { return rnd.Float64()*20 - 10 }
	for range 200 {
		var a, b mat4
		for i := range a {
			a[i], b[i] = num(), num()
		}
		x, y, z := num(), num(), num()

		var want mat4
		for col := range 4 {
			for row := range 4 {
				var sum float64
				for k := range 4 {
					sum += float64(a[k*4+row] * b[col*4+k])
				}
				want[col*4+row] = sum
			}
		}
		assert.Equal(s.T(), a.mul(b), want)

		gx, gy, gz := a.apply(x, y, z)
		assert.Equal(s.T(), gx, float64(a[0]*x)+float64(a[4]*y)+float64(a[8]*z)+a[12])
		assert.Equal(s.T(), gy, float64(a[1]*x)+float64(a[5]*y)+float64(a[9]*z)+a[13])
		assert.Equal(s.T(), gz, float64(a[2]*x)+float64(a[6]*y)+float64(a[10]*z)+a[14])

		minor := func(p, q, r, t int) float64 { return float64(a[p]*a[q]) - float64(a[r]*a[t]) }
		assert.Equal(s.T(), a.det3(),
			float64(a[0]*minor(5, 10, 9, 6))-float64(a[4]*minor(1, 10, 9, 2))+float64(a[8]*minor(1, 6, 5, 2)))

		q := [4]float64{num(), num(), num(), num()}
		sc := [3]float64{num(), num(), num()}
		r := [3][3]float64{
			{1 - 2*(float64(q[1]*q[1])+float64(q[2]*q[2])), 2 * (float64(q[0]*q[1]) - float64(q[2]*q[3])), 2 * (float64(q[0]*q[2]) + float64(q[1]*q[3]))},
			{2 * (float64(q[0]*q[1]) + float64(q[2]*q[3])), 1 - 2*(float64(q[0]*q[0])+float64(q[2]*q[2])), 2 * (float64(q[1]*q[2]) - float64(q[0]*q[3]))},
			{2 * (float64(q[0]*q[2]) - float64(q[1]*q[3])), 2 * (float64(q[1]*q[2]) + float64(q[0]*q[3])), 1 - 2*(float64(q[0]*q[0])+float64(q[1]*q[1]))},
		}
		got := trs([3]float64{x, y, z}, q, sc)
		for c := range 3 {
			for row := range 3 {
				assert.Equal(s.T(), got[c*4+row], float64(r[row][c]*sc[c]))
			}
		}
	}
}
