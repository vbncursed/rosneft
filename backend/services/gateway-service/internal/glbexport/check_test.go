package glbexport

import (
	"encoding/json"
	"testing"

	"github.com/qmuntal/gltf"
	"gotest.tools/v3/assert"
)

// testPayload is the EXT_meshopt_compression value, declared here so a wrong
// field name in the production struct cannot hide behind the same mistake.
type testPayload struct {
	Buffer, ByteOffset, ByteLength, ByteStride, Count int
	Mode, Filter                                      string
}

// checkIndices walks a document and asserts that every index is in range and
// that every bufferView on buffer 0 lies inside [0, binLen). It is the
// runnable stand-in for gltf-validator, which the repo does not carry.
func checkIndices(t *testing.T, doc *gltf.Document, binLen int64) {
	t.Helper()
	in := func(what string, i *int, n int) {
		t.Helper()
		if i != nil {
			assert.Assert(t, *i >= 0 && *i < n, "%s = %d, want [0, %d)", what, *i, n)
		}
	}
	for _, n := range doc.Nodes {
		in("node.mesh", n.Mesh, len(doc.Meshes))
		for _, c := range n.Children {
			in("node.children", &c, len(doc.Nodes))
		}
	}
	for _, sc := range doc.Scenes {
		for _, n := range sc.Nodes {
			in("scene.nodes", &n, len(doc.Nodes))
		}
	}
	in("scene", doc.Scene, len(doc.Scenes))
	for _, m := range doc.Meshes {
		for _, p := range m.Primitives {
			for _, a := range p.Attributes {
				in("primitive.attributes", &a, len(doc.Accessors))
			}
			in("primitive.indices", p.Indices, len(doc.Accessors))
			in("primitive.material", p.Material, len(doc.Materials))
		}
	}
	for _, m := range doc.Materials {
		if p := m.PBRMetallicRoughness; p != nil {
			for _, ti := range []*gltf.TextureInfo{p.BaseColorTexture, p.MetallicRoughnessTexture} {
				if ti != nil {
					in("material.texture", &ti.Index, len(doc.Textures))
				}
			}
		}
		if m.NormalTexture != nil {
			in("material.normalTexture", m.NormalTexture.Index, len(doc.Textures))
		}
		if m.OcclusionTexture != nil {
			in("material.occlusionTexture", m.OcclusionTexture.Index, len(doc.Textures))
		}
		if m.EmissiveTexture != nil {
			in("material.emissiveTexture", &m.EmissiveTexture.Index, len(doc.Textures))
		}
	}
	for _, tx := range doc.Textures {
		in("texture.source", tx.Source, len(doc.Images))
		in("texture.sampler", tx.Sampler, len(doc.Samplers))
		if raw, ok := tx.Extensions["KHR_texture_basisu"]; ok {
			var b struct{ Source int }
			assert.NilError(t, json.Unmarshal(raw.(json.RawMessage), &b))
			in("basisu.source", &b.Source, len(doc.Images))
		}
	}
	for _, im := range doc.Images {
		in("image.bufferView", im.BufferView, len(doc.BufferViews))
	}
	for _, a := range doc.Accessors {
		in("accessor.bufferView", a.BufferView, len(doc.BufferViews))
	}
	for i, bv := range doc.BufferViews {
		in("bufferView.buffer", &bv.Buffer, len(doc.Buffers))
		if bv.Buffer == 0 {
			assert.Assert(t, bv.ByteOffset >= 0 && int64(bv.ByteOffset+bv.ByteLength) <= binLen,
				"bufferView %d [%d,+%d) outside BIN of %d", i, bv.ByteOffset, bv.ByteLength, binLen)
		}
		if raw, ok := bv.Extensions["EXT_meshopt_compression"]; ok {
			var p testPayload
			assert.NilError(t, json.Unmarshal(raw.(json.RawMessage), &p))
			in("meshopt.buffer", &p.Buffer, len(doc.Buffers))
			if p.Buffer == 0 {
				assert.Assert(
					t,
					int64(p.ByteOffset+p.ByteLength) <= binLen,
					"meshopt payload of view %d outside BIN",
					i,
				)
			}
		}
	}
}
