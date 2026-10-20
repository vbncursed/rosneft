package objexport

import (
	"bytes"
	"encoding/binary"
	"math"
	"testing"
	"time"

	"github.com/qmuntal/gltf"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

var fixedTime = time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)

func testOpts() Options {
	return Options{Stem: "ust-kut", Ratio: 1, Metric: true, Modified: fixedTime}
}

// mesh is one primitive's data. A nil uv means no TEXCOORD_0; comp is the
// index component (tri sets Ushort).
type mesh struct {
	pos        [][3]float32
	uv         [][2]float32
	idx        []uint32
	comp       gltf.ComponentType
	mat        *int
	interleave bool // positions and uvs in one view, stride 20
}

func tri(pos ...[3]float32) mesh {
	return mesh{pos: pos, idx: []uint32{0, 1, 2}, comp: gltf.ComponentUshort}
}

func f32(b []byte, vals ...float32) []byte {
	for _, v := range vals {
		b = binary.LittleEndian.AppendUint32(b, math.Float32bits(v))
	}
	return b
}

func align4(b []byte) []byte {
	for len(b)%4 != 0 {
		b = append(b, 0)
	}
	return b
}

// docOf is one node holding one mesh made of the given primitives, with all
// data in buffer 0. It returns the document and its BIN.
func docOf(specs ...mesh) (*gltf.Document, []byte) {
	doc := &gltf.Document{
		Asset:  gltf.Asset{Version: "2.0"},
		Scene:  new(0),
		Scenes: []*gltf.Scene{{Nodes: []int{0}}},
		Nodes:  []*gltf.Node{{Name: "n", Mesh: new(0)}},
		Meshes: []*gltf.Mesh{{}},
	}
	var bin []byte
	view := func(data []byte, stride int) *int {
		bin = align4(bin)
		doc.BufferViews = append(doc.BufferViews, &gltf.BufferView{ByteOffset: len(bin), ByteLength: len(data), ByteStride: stride})
		bin = append(bin, data...)
		return new(len(doc.BufferViews) - 1)
	}
	acc := func(v *int, off int, c gltf.ComponentType, t gltf.AccessorType, n int) int {
		doc.Accessors = append(doc.Accessors, &gltf.Accessor{BufferView: v, ByteOffset: off, ComponentType: c, Type: t, Count: n})
		return len(doc.Accessors) - 1
	}
	for _, m := range specs {
		p := &gltf.Primitive{Attributes: gltf.PrimitiveAttributes{}, Material: m.mat}
		switch {
		case m.interleave:
			var data []byte
			for i, v := range m.pos {
				data = f32(data, v[0], v[1], v[2], m.uv[i][0], m.uv[i][1])
			}
			v := view(data, 20)
			p.Attributes["POSITION"] = acc(v, 0, gltf.ComponentFloat, gltf.AccessorVec3, len(m.pos))
			p.Attributes["TEXCOORD_0"] = acc(v, 12, gltf.ComponentFloat, gltf.AccessorVec2, len(m.uv))
		default:
			var data []byte
			for _, v := range m.pos {
				data = f32(data, v[0], v[1], v[2])
			}
			p.Attributes["POSITION"] = acc(view(data, 0), 0, gltf.ComponentFloat, gltf.AccessorVec3, len(m.pos))
			if m.uv != nil {
				data = nil
				for _, v := range m.uv {
					data = f32(data, v[0], v[1])
				}
				p.Attributes["TEXCOORD_0"] = acc(view(data, 0), 0, gltf.ComponentFloat, gltf.AccessorVec2, len(m.uv))
			}
		}
		var data []byte
		for _, i := range m.idx {
			switch m.comp {
			case gltf.ComponentUbyte:
				data = append(data, byte(i))
			case gltf.ComponentUshort:
				data = binary.LittleEndian.AppendUint16(data, uint16(i))
			default:
				data = binary.LittleEndian.AppendUint32(data, i)
			}
		}
		p.Indices = new(acc(view(data, 0), 0, m.comp, gltf.AccessorScalar, len(m.idx)))
		doc.Meshes[0].Primitives = append(doc.Meshes[0].Primitives, p)
	}
	doc.Buffers = []*gltf.Buffer{{ByteLength: len(bin)}}
	return doc, bin
}

// withImage appends image bytes to the BIN and a texture on them; the
// returned texture index feeds withMaterial.
func withImage(doc *gltf.Document, bin []byte, name, mime string) ([]byte, int) {
	bin = align4(bin)
	doc.BufferViews = append(doc.BufferViews, &gltf.BufferView{ByteOffset: len(bin), ByteLength: len(name) + 4})
	bin = append(bin, "img:"+name...)
	doc.Images = append(doc.Images, &gltf.Image{Name: name, MimeType: mime, BufferView: new(len(doc.BufferViews) - 1)})
	doc.Textures = append(doc.Textures, &gltf.Texture{Source: new(len(doc.Images) - 1)})
	doc.Buffers[0].ByteLength = len(bin)
	return bin, len(doc.Textures) - 1
}

// withMaterial appends a material (texture < 0: none) and returns its index.
func withMaterial(doc *gltf.Document, name string, texture int, factor [4]float64) int {
	pbr := &gltf.PBRMetallicRoughness{BaseColorFactor: &factor}
	if texture >= 0 {
		pbr.BaseColorTexture = &gltf.TextureInfo{Index: texture}
	}
	doc.Materials = append(doc.Materials, &gltf.Material{Name: name, PBRMetallicRoughness: pbr})
	return len(doc.Materials) - 1
}

// glbOf frames doc and bin as a binary GLB.
func glbOf(t testing.TB, doc *gltf.Document, bin []byte) []byte {
	t.Helper()
	doc.Buffers[0].Data = bin
	var buf bytes.Buffer
	assert.NilError(t, gltf.NewEncoder(&buf).Encode(doc))
	return buf.Bytes()
}

// headOf reads the head back from the framed blob, as the gateway does.
func headOf(t *testing.T, blob []byte) glbexport.Head {
	t.Helper()
	h, err := glbexport.ReadHead(bytes.NewReader(blob))
	assert.NilError(t, err)
	return h
}

// loose is a Head with no bytes behind it, enough for Build.
func loose(doc *gltf.Document, binLen int64) glbexport.Head {
	return glbexport.Head{Doc: doc, BinLength: binLen}
}

func place(hash, name string) glbexport.Placement {
	return glbexport.Placement{Hash: hash, Name: name, Scale: [3]float64{1, 1, 1}}
}
