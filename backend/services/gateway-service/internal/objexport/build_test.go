package objexport

import (
	"math"
	"testing"

	"github.com/qmuntal/gltf"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

type BuildSuite struct{ suite.Suite }

func TestBuildSuite(t *testing.T) { suite.Run(t, new(BuildSuite)) }

// validDoc is a textured triangle: accessors 0/1/2 are POSITION/TEXCOORD_0/
// indices, views 0/1/2 their data, view 3 the PNG, material 0 uses it.
func validDoc() (*gltf.Document, []byte) {
	m := tri([3]float32{0, 0, 0}, [3]float32{1, 0, 0}, [3]float32{0, 1, 0})
	m.uv = [][2]float32{{0, 0}, {1, 0}, {0, 1}}
	doc, bin := docOf(m)
	bin, tex := withImage(doc, bin, "a.png", "image/png")
	doc.Meshes[0].Primitives[0].Material = new(withMaterial(doc, "M", tex, [4]float64{1, 1, 1, 1}))
	return doc, bin
}

func (s *BuildSuite) TestRefusals() {
	cases := []struct {
		name   string
		mutate func(d *gltf.Document, binLen int)
		want   error
	}{
		{
			"extension",
			func(d *gltf.Document, _ int) { d.ExtensionsUsed = []string{"KHR_texture_transform"} },
			ErrUnsupported,
		},
		{
			"points mode",
			func(d *gltf.Document, _ int) { d.Meshes[0].Primitives[0].Mode = gltf.PrimitivePoints },
			ErrUnsupported,
		},
		{"normalized uv", func(d *gltf.Document, _ int) { d.Accessors[1].Normalized = true }, ErrUnsupported},
		{
			"sparse accessor",
			func(d *gltf.Document, _ int) { d.Accessors[0].Sparse = &gltf.Sparse{Count: 1} },
			ErrUnsupported,
		},
		{
			"texCoord 1",
			func(d *gltf.Document, _ int) { d.Materials[0].PBRMetallicRoughness.BaseColorTexture.TexCoord = 1 },
			ErrUnsupported,
		},
		{"gif image", func(d *gltf.Document, _ int) { d.Images[0].MimeType = "image/gif" }, ErrUnsupported},
		{"no indices", func(d *gltf.Document, _ int) { d.Meshes[0].Primitives[0].Indices = nil }, ErrUnsupported},
		{"position as VEC2", func(d *gltf.Document, _ int) { d.Accessors[0].Type = gltf.AccessorVec2 }, ErrUnsupported},
		{"view on buffer 1", func(d *gltf.Document, _ int) { d.BufferViews[0].Buffer = 1 }, ErrUnsupported},
		{
			"accessor view past the BIN",
			func(d *gltf.Document, binLen int) { d.BufferViews[0].ByteOffset = binLen - 35 },
			ErrMalformed,
		},
		{"view range overflows int64", func(d *gltf.Document, _ int) {
			d.BufferViews[0].ByteOffset, d.BufferViews[0].ByteLength = math.MaxInt, math.MaxInt
		}, ErrMalformed},
		{"stride below the element", func(d *gltf.Document, _ int) { d.BufferViews[0].ByteStride = 8 }, ErrMalformed},
		{"index count 4", func(d *gltf.Document, _ int) {
			d.Accessors[2].Count = 4
			d.BufferViews[2].ByteLength = 8
		}, ErrMalformed},
		{"uv count differs", func(d *gltf.Document, _ int) { d.Accessors[1].Count = 2 }, ErrMalformed},
		{"node reached twice", func(d *gltf.Document, _ int) { d.Scenes[0].Nodes = []int{0, 0} }, ErrMalformed},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			doc, bin := validDoc()
			tc.mutate(doc, len(bin))

			_, err := Build(
				[]glbexport.Placement{place("x", "x")},
				map[string]glbexport.Head{"x": loose(doc, int64(len(bin)))},
				testOpts(),
			)

			assert.ErrorIs(s.T(), err, tc.want)
		})
	}
}

func (s *BuildSuite) TestValidDocBuilds() {
	doc, bin := validDoc()

	_, err := Build(
		[]glbexport.Placement{place("x", "x")},
		map[string]glbexport.Head{"x": loose(doc, int64(len(bin)))},
		testOpts(),
	)

	assert.NilError(s.T(), err)
}

func (s *BuildSuite) TestMissingHeadIsAnError() {
	_, err := Build([]glbexport.Placement{place("x", "x")}, map[string]glbexport.Head{}, testOpts())

	assert.Assert(s.T(), err != nil)
}

// bigDoc declares pos vertices and idx uint32 indices without any bytes.
func bigDoc(pos, idx int) (glbexport.Head, *gltf.Document) {
	doc := &gltf.Document{
		Scene:  new(0),
		Scenes: []*gltf.Scene{{Nodes: []int{0}}},
		Nodes:  []*gltf.Node{{Mesh: new(0)}},
		Meshes: []*gltf.Mesh{
			{Primitives: []*gltf.Primitive{{Attributes: gltf.PrimitiveAttributes{"POSITION": 0}, Indices: new(1)}}},
		},
		Accessors: []*gltf.Accessor{
			{BufferView: new(0), ComponentType: gltf.ComponentFloat, Type: gltf.AccessorVec3, Count: pos},
			{BufferView: new(1), ComponentType: gltf.ComponentUint, Type: gltf.AccessorScalar, Count: idx},
		},
		BufferViews: []*gltf.BufferView{{ByteLength: 12 * pos}, {ByteOffset: 12 * pos, ByteLength: 4 * idx}},
		Buffers:     []*gltf.Buffer{{ByteLength: 12*pos + 4*idx}},
	}
	return loose(doc, int64(12*pos+4*idx)), doc
}

func (s *BuildSuite) TestCeilings() {
	small, _ := bigDoc(3, 3)
	model, _ := bigDoc(10_000_000, 3)
	manyNodes, nodesDoc := bigDoc(3, 3)
	nodesDoc.Nodes = append(nodesDoc.Nodes, make([]*gltf.Node, 999)...)
	for i := 1; i < len(nodesDoc.Nodes); i++ {
		nodesDoc.Nodes[i] = &gltf.Node{}
	}
	atVerts, _ := bigDoc(MaxVertices, 3)
	overVerts, _ := bigDoc(MaxVertices+1, 3)
	overFaces, _ := bigDoc(3, 3*(MaxFaces+1))
	three := []glbexport.Placement{place("t", "t"), place("m", "m"), place("m", "m")}
	crowd := make([]glbexport.Placement, 300)
	for i := range crowd {
		crowd[i] = place("n", "n")
	}

	cases := []struct {
		name  string
		ps    []glbexport.Placement
		heads map[string]glbexport.Head
		want  error
	}{
		{
			"vertices at the ceiling",
			[]glbexport.Placement{place("t", "t")},
			map[string]glbexport.Head{"t": atVerts},
			nil,
		},
		{
			"one vertex over",
			[]glbexport.Placement{place("t", "t")},
			map[string]glbexport.Head{"t": overVerts},
			ErrTooLarge,
		},
		{
			"one face over",
			[]glbexport.Placement{place("t", "t")},
			map[string]glbexport.Head{"t": overFaces},
			ErrTooLarge,
		},
		{"sum across placements", three, map[string]glbexport.Head{"t": small, "m": model}, ErrTooLarge},
		{"placements times nodes", crowd, map[string]glbexport.Head{"n": manyNodes}, ErrTooLarge},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			_, err := Build(tc.ps, tc.heads, testOpts())

			if tc.want == nil {
				assert.NilError(s.T(), err)
				return
			}
			assert.ErrorIs(s.T(), err, tc.want)
		})
	}
}
