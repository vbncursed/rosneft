package objexport

import (
	"math"

	"github.com/qmuntal/gltf"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

// TestRejectionTexts pins every refusal of the input parsers (view, accessor,
// primitive) with its kind and exact text, one minimal malformed document each,
// plus which refusal wins when a document breaks two rules.
func (s *BuildSuite) TestRejectionTexts() {
	const pre = `objexport: placement "x": `
	const mal, un = pre + "objexport: malformed glb: ", pre + "objexport: unsupported glTF feature: "
	prim := func(d *gltf.Document) *gltf.Primitive { return d.Meshes[0].Primitives[0] }
	cases := []struct {
		name   string
		mutate func(d *gltf.Document)
		want   error
		text   string
	}{
		{
			"null element", func(d *gltf.Document) { d.Nodes = append(d.Nodes, nil) }, ErrMalformed,
			`objexport: placement "x": blob x: objexport: malformed glb: glbexport: malformed glb: null array element`,
		},
		{
			"mesh out of range",
			func(d *gltf.Document) { d.Nodes[0].Mesh = new(5) },
			ErrMalformed,
			mal + "mesh 5 out of range [0, 1)",
		},
		{"morph targets", func(d *gltf.Document) {
			prim(d).Targets = []gltf.PrimitiveAttributes{{"POSITION": 0}}
		}, ErrUnsupported, un + "morph targets"},
		{
			"no POSITION",
			func(d *gltf.Document) { delete(prim(d).Attributes, "POSITION") },
			ErrMalformed,
			mal + "primitive without POSITION",
		},
		{"POSITION accessor out of range", func(d *gltf.Document) {
			prim(d).Attributes["POSITION"] = 99
		}, ErrMalformed, mal + "accessor 99 out of range [0, 3)"},
		{"POSITION accessor negative", func(d *gltf.Document) {
			prim(d).Attributes["POSITION"] = -1
		}, ErrMalformed, mal + "accessor -1 out of range [0, 3)"},
		{"index accessor out of range", func(d *gltf.Document) {
			prim(d).Indices = new(99)
		}, ErrMalformed, mal + "accessor 99 out of range [0, 3)"},
		{"index accessor is float", func(d *gltf.Document) {
			d.Accessors[2].ComponentType = gltf.ComponentFloat
		}, ErrUnsupported, un + "accessor 2 is FLOAT SCALAR (normalized false)"},
		{"index count 4", func(d *gltf.Document) {
			d.Accessors[2].Count = 4
			d.BufferViews[2].ByteLength = 8
		}, ErrMalformed, mal + "index count 4 is not a multiple of 3"},
		{"TEXCOORD_0 accessor out of range", func(d *gltf.Document) {
			prim(d).Attributes["TEXCOORD_0"] = 99
		}, ErrMalformed, mal + "accessor 99 out of range [0, 3)"},
		{"TEXCOORD_0 is VEC3", func(d *gltf.Document) {
			d.Accessors[1].Type = gltf.AccessorVec3
		}, ErrUnsupported, un + "accessor 1 is FLOAT VEC3 (normalized false)"},
		{"TEXCOORD_0 count differs", func(d *gltf.Document) {
			d.Accessors[1].Count = 2
		}, ErrMalformed, mal + "TEXCOORD_0 has 2 elements, POSITION 3"},
		{"material out of range", func(d *gltf.Document) {
			prim(d).Material = new(5)
		}, ErrMalformed, mal + "material 5 out of range [0, 1)"},
		{"material negative", func(d *gltf.Document) {
			prim(d).Material = new(-1)
		}, ErrMalformed, mal + "material -1 out of range [0, 1)"},
		{"accessor without bufferView", func(d *gltf.Document) {
			d.Accessors[0].BufferView = nil
		}, ErrUnsupported, un + "accessor 0 has no bufferView"},
		{"accessor bufferView out of range", func(d *gltf.Document) {
			d.Accessors[0].BufferView = new(99)
		}, ErrMalformed, mal + "bufferView 99 out of range [0, 4)"},
		{"accessor bufferView negative", func(d *gltf.Document) {
			d.Accessors[0].BufferView = new(-1)
		}, ErrMalformed, mal + "bufferView -1 out of range [0, 4)"},
		{"view on buffer 1", func(d *gltf.Document) {
			d.BufferViews[0].Buffer = 1
		}, ErrUnsupported, un + "bufferView 0 is on buffer 1"},
		{"view offset negative", func(d *gltf.Document) {
			d.BufferViews[0].ByteOffset = -1
		}, ErrMalformed, mal + "bufferView 0 [-1,+36) outside the 77-byte BIN"},
		{"view length negative", func(d *gltf.Document) {
			d.BufferViews[0].ByteLength = -1
		}, ErrMalformed, mal + "bufferView 0 [0,+-1) outside the 77-byte BIN"},
		{"view stride negative", func(d *gltf.Document) {
			d.BufferViews[0].ByteStride = -1
		}, ErrMalformed, mal + "bufferView 0 [0,+36) outside the 77-byte BIN"},
		{"view offset beyond int64 room", func(d *gltf.Document) {
			d.BufferViews[0].ByteOffset = math.MaxInt
		}, ErrMalformed, mal + "bufferView 0 [9223372036854775807,+36) outside the 77-byte BIN"},
		{"accessor offset negative", func(d *gltf.Document) {
			d.Accessors[0].ByteOffset = -1
		}, ErrMalformed, mal + "accessor 0: 3 elements of 12 bytes at stride 12 do not fit its bufferView"},
		{"accessor offset past its view", func(d *gltf.Document) {
			d.Accessors[0].ByteOffset = 1000
		}, ErrMalformed, mal + "accessor 0: 3 elements of 12 bytes at stride 12 do not fit its bufferView"},
		{"accessor count 0", func(d *gltf.Document) {
			d.Accessors[0].Count = 0
		}, ErrMalformed, mal + "accessor 0: 0 elements of 12 bytes at stride 12 do not fit its bufferView"},
		{"accessor count huge", func(d *gltf.Document) {
			d.Accessors[0].Count = math.MaxInt
		}, ErrMalformed, mal + "accessor 0: 9223372036854775807 elements of 12 bytes at stride 12 do not fit its bufferView"},
		{"normalized beats a bad view", func(d *gltf.Document) {
			d.Accessors[0].Normalized = true
			d.Accessors[0].BufferView = new(99)
		}, ErrUnsupported, un + "accessor 0 is FLOAT VEC3 (normalized true)"},
		{"no indices beats morph targets", func(d *gltf.Document) {
			prim(d).Indices = nil
			prim(d).Targets = []gltf.PrimitiveAttributes{{"POSITION": 0}}
		}, ErrUnsupported, un + "primitive without indices"},
		{"morph targets beat a missing POSITION", func(d *gltf.Document) {
			prim(d).Targets = []gltf.PrimitiveAttributes{{"POSITION": 0}}
			delete(prim(d).Attributes, "POSITION")
		}, ErrUnsupported, un + "morph targets"},
		{"POSITION is checked before the indices", func(d *gltf.Document) {
			prim(d).Attributes["POSITION"] = 99
			prim(d).Indices = new(98)
		}, ErrMalformed, mal + "accessor 99 out of range [0, 3)"},
		{"index count is checked before the uvs", func(d *gltf.Document) {
			d.Accessors[2].Count = 4
			d.BufferViews[2].ByteLength = 8
			d.Accessors[1].Count = 2
		}, ErrMalformed, mal + "index count 4 is not a multiple of 3"},
		{"uv count is checked before the material", func(d *gltf.Document) {
			d.Accessors[1].Count = 2
			prim(d).Material = new(5)
		}, ErrMalformed, mal + "TEXCOORD_0 has 2 elements, POSITION 3"},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			doc, bin := validDoc()
			tc.mutate(doc)

			_, err := Build(
				[]glbexport.Placement{place("x", "x")},
				map[string]glbexport.Head{"x": loose(doc, int64(len(bin)))},
				testOpts(),
			)

			assert.ErrorIs(s.T(), err, tc.want)
			assert.Error(s.T(), err, tc.text)
		})
	}
}

func (s *BuildSuite) TestFitsView() {
	view := &gltf.BufferView{ByteLength: 36}
	cases := []struct {
		name         string
		count, off   int
		elem, stride int
		want         bool
	}{
		{"exactly fits", 3, 0, 12, 12, true},
		{"one element over", 4, 0, 12, 12, false},
		{"offset eats the last element", 3, 1, 12, 12, false},
		{"stride leaves slack", 2, 0, 12, 24, true},
		{"stride too wide for the count", 3, 0, 12, 24, false},
		{"stride below the element", 3, 0, 12, 8, false},
		{"no elements", 0, 0, 12, 12, false},
		{"negative offset", 3, -1, 12, 12, false},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			a := &gltf.Accessor{Count: tc.count, ByteOffset: tc.off}
			assert.Equal(s.T(), fitsView(a, view, tc.elem, tc.stride), tc.want)
		})
	}
}
