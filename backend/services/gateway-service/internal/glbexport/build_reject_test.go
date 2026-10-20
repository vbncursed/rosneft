package glbexport

import (
	"encoding/json"

	"github.com/qmuntal/gltf"
	"gotest.tools/v3/assert"
)

func (s *BuildSuite) TestRejects() {
	cases := []struct {
		name   string
		base   fixture
		mutate func(d *gltf.Document)
		want   error
	}{
		{"draco", triangleDoc, func(d *gltf.Document) { d.ExtensionsUsed = []string{"KHR_draco_mesh_compression"} }, ErrUnsupported},
		{"animations", triangleDoc, func(d *gltf.Document) { d.Animations = []*gltf.Animation{{}} }, ErrUnsupported},
		{"skins", triangleDoc, func(d *gltf.Document) { d.Skins = []*gltf.Skin{{Joints: []int{0}}} }, ErrUnsupported},
		{"cameras", triangleDoc, func(d *gltf.Document) { d.Cameras = []*gltf.Camera{{Type: "perspective"}} }, ErrUnsupported},
		{"sparse accessor", triangleDoc, func(d *gltf.Document) { d.Accessors[0].Sparse = &gltf.Sparse{Count: 1} }, ErrUnsupported},
		{"buffer 0 uri", triangleDoc, func(d *gltf.Document) { d.Buffers[0].URI = "data.bin" }, ErrUnsupported},
		{"image uri", texturedQuadDoc, func(d *gltf.Document) { d.Images[0].URI = "a.png"; d.Images[0].BufferView = nil }, ErrUnsupported},
		{"extra buffer without fallback", triangleDoc, func(d *gltf.Document) { d.Buffers = append(d.Buffers, &gltf.Buffer{ByteLength: 4}) }, ErrUnsupported},
		{"extra buffer with uri", meshoptDoc, func(d *gltf.Document) { d.Buffers[1].URI = "x.bin" }, ErrUnsupported},
		{"accessor bufferView out of range", triangleDoc, func(d *gltf.Document) { d.Accessors[0].BufferView = new(99) }, ErrMalformed},
		{"node child cycle", triangleDoc, func(d *gltf.Document) { d.Nodes[0].Children = []int{0} }, ErrMalformed},
		{"bufferView past the BIN", triangleDoc, func(d *gltf.Document) { d.BufferViews[1].ByteLength = 60 }, ErrMalformed},
		{"meshopt payload buffer out of range", meshoptDoc, func(d *gltf.Document) {
			d.BufferViews[0].Extensions["EXT_meshopt_compression"] = json.RawMessage(`{"buffer":7,"byteLength":20,"byteStride":12,"count":3,"mode":"ATTRIBUTES"}`)
		}, ErrMalformed},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			doc, bin := tc.base()
			tc.mutate(doc)
			h := Head{Doc: doc, BinLength: int64(len(bin) + len(bin)%4)}

			_, err := Build([]Placement{place("x", "x")}, map[string]Head{"x": h})

			assert.ErrorIs(s.T(), err, tc.want)
		})
	}
}

func (s *BuildSuite) TestMissingHead() {
	_, err := Build([]Placement{place("gone", "x")}, map[string]Head{})

	assert.ErrorContains(s.T(), err, "no head for blob gone")
}

func (s *BuildSuite) TestTooLarge() {
	a, _ := triangleDoc()
	b, _ := triangleDoc()
	heads := map[string]Head{"a": {Doc: a, BinLength: 3 << 30}, "b": {Doc: b, BinLength: 3 << 30}}

	_, err := Build([]Placement{place("a", "a"), place("b", "b")}, heads)

	assert.ErrorIs(s.T(), err, ErrTooLarge)
}
