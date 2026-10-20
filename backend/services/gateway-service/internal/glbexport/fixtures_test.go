package glbexport

import (
	"encoding/binary"
	"encoding/json"
	"testing"

	"github.com/qmuntal/gltf"
	"gotest.tools/v3/assert"
)

// padTo4 appends pad bytes until len(b) is a multiple of 4.
func padTo4(b []byte, pad byte) []byte {
	for len(b)%4 != 0 {
		b = append(b, pad)
	}
	return b
}

// makeGLB frames doc and bin by hand: gltf.Encoder cannot write the meshopt
// fallback buffer. A nil bin writes no BIN chunk.
func makeGLB(t *testing.T, doc *gltf.Document, bin []byte) []byte {
	t.Helper()
	js, err := json.Marshal(doc)
	assert.NilError(t, err)
	js = padTo4(js, ' ')
	bin = padTo4(append([]byte(nil), bin...), 0)

	total := 12 + 8 + len(js)
	if len(bin) > 0 {
		total += 8 + len(bin)
	}
	out := binary.LittleEndian.AppendUint32(nil, 0x46546C67) // "glTF"
	out = binary.LittleEndian.AppendUint32(out, 2)
	out = binary.LittleEndian.AppendUint32(out, uint32(total))
	out = binary.LittleEndian.AppendUint32(out, uint32(len(js)))
	out = binary.LittleEndian.AppendUint32(out, 0x4E4F534A) // "JSON"
	out = append(out, js...)
	if len(bin) > 0 {
		out = binary.LittleEndian.AppendUint32(out, uint32(len(bin)))
		out = binary.LittleEndian.AppendUint32(out, 0x004E4942) // "BIN\0"
		out = append(out, bin...)
	}
	return out
}

// binOf is n bytes that differ per seed, so a misplaced segment shows.
func binOf(n int, seed byte) []byte {
	b := make([]byte, n)
	for i := range b {
		b[i] = seed + byte(i)
	}
	return b
}

// headOf frames a document and reads its head back, as a real blob would be.
func headOf(t *testing.T, doc *gltf.Document, bin []byte) Head {
	t.Helper()
	h, err := ReadHead(bytesReader(makeGLB(t, doc, bin)))
	assert.NilError(t, err)
	return h
}

// triangleDoc is positions (36 bytes) + indices (6 bytes) on buffer 0: a
// 42-byte BIN that is not a multiple of 4.
func triangleDoc() (*gltf.Document, []byte) {
	doc := &gltf.Document{
		Asset:  gltf.Asset{Version: "2.0"},
		Scene:  new(0),
		Scenes: []*gltf.Scene{{Nodes: []int{0}}},
		Nodes:  []*gltf.Node{{Name: "tri", Mesh: new(0)}},
		Meshes: []*gltf.Mesh{{Primitives: []*gltf.Primitive{{
			Attributes: gltf.PrimitiveAttributes{"POSITION": 0},
			Indices:    new(1),
		}}}},
		Accessors: []*gltf.Accessor{
			{BufferView: new(0), ComponentType: gltf.ComponentFloat, Count: 3, Type: gltf.AccessorVec3},
			{BufferView: new(1), ComponentType: gltf.ComponentUshort, Count: 3, Type: gltf.AccessorScalar},
		},
		BufferViews: []*gltf.BufferView{
			{Buffer: 0, ByteOffset: 0, ByteLength: 36},
			{Buffer: 0, ByteOffset: 36, ByteLength: 6},
		},
		Buffers: []*gltf.Buffer{{ByteLength: 42}},
	}
	return doc, binOf(42, 1)
}

// rootTransformDoc has two scene roots; root 0 is translated and has the
// mesh on its child. The geometry is the triangle's.
func rootTransformDoc() (*gltf.Document, []byte) {
	doc, bin := triangleDoc()
	doc.Nodes = []*gltf.Node{
		{Name: "root0", Translation: [3]float64{1, 2, 3}, Children: []int{2}},
		{Name: "root1"},
		{Name: "child", Mesh: new(0)},
	}
	doc.Scenes = []*gltf.Scene{{Nodes: []int{0, 1}}}
	return doc, bin
}

// texturedQuadDoc: positions 48, uvs 32, indices 12, one KTX2 image 16 bytes
// = 108 bytes, with a sampler, a basisu texture and a material using it twice.
func texturedQuadDoc() (*gltf.Document, []byte) {
	doc := &gltf.Document{
		Asset:              gltf.Asset{Version: "2.0"},
		ExtensionsUsed:     []string{"KHR_texture_basisu"},
		ExtensionsRequired: []string{"KHR_texture_basisu"},
		Scene:              new(0),
		Scenes:             []*gltf.Scene{{Nodes: []int{0}}},
		Nodes:              []*gltf.Node{{Name: "quad", Mesh: new(0)}},
		Meshes: []*gltf.Mesh{{Primitives: []*gltf.Primitive{{
			Attributes: gltf.PrimitiveAttributes{"POSITION": 0, "TEXCOORD_0": 1},
			Indices:    new(2),
			Material:   new(0),
		}}}},
		Accessors: []*gltf.Accessor{
			{BufferView: new(0), ComponentType: gltf.ComponentFloat, Count: 4, Type: gltf.AccessorVec3},
			{BufferView: new(1), ComponentType: gltf.ComponentFloat, Count: 4, Type: gltf.AccessorVec2},
			{BufferView: new(2), ComponentType: gltf.ComponentUshort, Count: 6, Type: gltf.AccessorScalar},
		},
		BufferViews: []*gltf.BufferView{
			{Buffer: 0, ByteOffset: 0, ByteLength: 48},
			{Buffer: 0, ByteOffset: 48, ByteLength: 32},
			{Buffer: 0, ByteOffset: 80, ByteLength: 12},
			{Buffer: 0, ByteOffset: 92, ByteLength: 16},
		},
		Images:   []*gltf.Image{{BufferView: new(3), MimeType: "image/ktx2"}},
		Samplers: []*gltf.Sampler{{}},
		Textures: []*gltf.Texture{{
			Sampler:    new(0),
			Extensions: gltf.Extensions{"KHR_texture_basisu": json.RawMessage(`{"source":0}`)},
		}},
		Materials: []*gltf.Material{{
			PBRMetallicRoughness: &gltf.PBRMetallicRoughness{BaseColorTexture: &gltf.TextureInfo{Index: 0}},
			NormalTexture:        &gltf.NormalTexture{Index: new(0)},
		}},
		Buffers: []*gltf.Buffer{{ByteLength: 108}},
	}
	return doc, binOf(108, 100)
}

const meshoptJSON = `{"buffer":0,"byteOffset":8,"byteLength":20,"byteStride":12,"count":3,"mode":"ATTRIBUTES","filter":"NONE"}`

// meshoptDoc is gltfpack's shape: buffer 0 is the BIN (40 bytes), buffer 1 a
// data-less fallback; the positions view lives on buffer 1 and its meshopt
// payload points back into buffer 0 at byte 8; the indices view is plain.
func meshoptDoc() (*gltf.Document, []byte) {
	doc, _ := triangleDoc()
	doc.ExtensionsUsed = []string{"EXT_meshopt_compression"}
	doc.ExtensionsRequired = []string{"EXT_meshopt_compression"}
	doc.BufferViews = []*gltf.BufferView{
		{
			Buffer: 1, ByteLength: 36,
			Extensions: gltf.Extensions{"EXT_meshopt_compression": json.RawMessage(meshoptJSON)},
		},
		{Buffer: 0, ByteOffset: 28, ByteLength: 6},
	}
	doc.Buffers = []*gltf.Buffer{
		{ByteLength: 40},
		{ByteLength: 36, Extensions: gltf.Extensions{"EXT_meshopt_compression": json.RawMessage(`{"fallback":true}`)}},
	}
	return doc, binOf(40, 50)
}
