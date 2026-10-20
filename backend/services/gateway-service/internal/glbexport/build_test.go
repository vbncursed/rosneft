package glbexport

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/qmuntal/gltf"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
	"gotest.tools/v3/golden"
)

type fixture func() (*gltf.Document, []byte)

type BuildSuite struct{ suite.Suite }

func TestBuildSuite(t *testing.T) { suite.Run(t, new(BuildSuite)) }

func (s *BuildSuite) head(f fixture) Head {
	doc, bin := f()
	return headOf(s.T(), doc, bin)
}

func place(hash, name string) Placement {
	return Placement{Hash: hash, Name: name, Scale: [3]float64{1, 1, 1}}
}

// build plans and decodes the plan's JSON back, as a reader of the file would.
func (s *BuildSuite) build(ps []Placement, heads map[string]Head) (Plan, *gltf.Document) {
	plan, err := Build(ps, heads)
	assert.NilError(s.T(), err)
	doc := new(gltf.Document)
	assert.NilError(s.T(), json.Unmarshal(plan.JSON, doc))
	return plan, doc
}

func (s *BuildSuite) payload(raw any) testPayload {
	var p testPayload
	assert.NilError(s.T(), json.Unmarshal(raw.(json.RawMessage), &p))
	return p
}

func (s *BuildSuite) TestTerritoryOnly() {
	h := s.head(triangleDoc)
	plan, doc := s.build([]Placement{place("t", "Ust-Kut")}, map[string]Head{"t": h})

	assert.DeepEqual(s.T(), doc.Scenes[0].Nodes, []int{0})
	assert.Equal(s.T(), doc.Nodes[0].Name, "Ust-Kut")
	assert.DeepEqual(s.T(), doc.Nodes[0].Children, []int{1})
	assert.Equal(s.T(), doc.Nodes[1].Name, "tri")
	assert.Equal(s.T(), len(doc.Meshes), 1)
	assert.DeepEqual(s.T(), plan.Segments, []Segment{{Hash: "t", Offset: h.BinOffset, Length: 44, OutOffset: 0}})
	assert.Equal(s.T(), plan.Size, int64(12+8+len(plan.JSON)+8+44))
	assert.Equal(s.T(), len(plan.JSON)%4, 0)
}

func (s *BuildSuite) TestOneModelThreePlacements() {
	heads := map[string]Head{"t": s.head(triangleDoc), "m": s.head(texturedQuadDoc)}
	ps := make([]Placement, 1, 4)
	ps[0] = place("t", "terrain")
	for i := range 3 {
		ps = append(ps, Placement{
			Hash: "m", Name: "tank", Translation: [3]float64{float64(i), 2, 3},
			Rotation: [3]float64{0.3, -1.2, 2.5}, Scale: [3]float64{2, 3, 4},
		})
	}

	plan, doc := s.build(ps, heads)

	assert.Equal(s.T(), len(doc.Meshes), 2)
	assert.Equal(s.T(), len(plan.Segments), 2)
	assert.Equal(s.T(), len(doc.Scenes[0].Nodes), 4)
	for i, n := range doc.Scenes[0].Nodes[1:] {
		pn := doc.Nodes[n]
		assert.DeepEqual(s.T(), pn.Translation, [3]float64{float64(i), 2, 3})
		assert.DeepEqual(s.T(), pn.Scale, [3]float64{2, 3, 4})
		assert.DeepEqual(s.T(), pn.Rotation, quatFromEulerXYZ(0.3, -1.2, 2.5))
		assert.Equal(s.T(), *doc.Nodes[pn.Children[0]].Mesh, 1, "every copy shares the model's mesh")
	}
}

func (s *BuildSuite) TestTwoModels() {
	heads := map[string]Head{"t": s.head(triangleDoc), "a": s.head(texturedQuadDoc), "b": s.head(texturedQuadDoc)}
	plan, doc := s.build([]Placement{place("t", "t"), place("a", "a"), place("b", "b")}, heads)

	assert.Equal(s.T(), len(doc.Accessors), 8)
	assert.Equal(s.T(), len(doc.BufferViews), 10)
	assert.Equal(s.T(), len(doc.Materials), 2)
	b := doc.Meshes[2].Primitives[0] // second model: 2 + 3 accessors, 1 material before it
	assert.DeepEqual(s.T(), b.Attributes, gltf.PrimitiveAttributes{"POSITION": 5, "TEXCOORD_0": 6})
	assert.Equal(s.T(), *b.Indices, 7)
	assert.Equal(s.T(), *b.Material, 1)
	assert.Equal(s.T(), *doc.Accessors[5].BufferView, 6)
	assert.Equal(s.T(), *doc.Images[1].BufferView, 9)
	assert.Equal(s.T(), *doc.Textures[1].Sampler, 1)
	assert.Equal(s.T(), doc.Materials[1].PBRMetallicRoughness.BaseColorTexture.Index, 1)
	assert.Equal(s.T(), *doc.Materials[1].NormalTexture.Index, 1)
	var src struct{ Source int }
	assert.NilError(s.T(), json.Unmarshal(doc.Textures[1].Extensions["KHR_texture_basisu"].(json.RawMessage), &src))
	assert.Equal(s.T(), src.Source, 1)
	checkIndices(s.T(), doc, plan.BinLength)
}

func (s *BuildSuite) TestShiftsBuffer0Offsets() {
	heads := map[string]Head{"t": s.head(triangleDoc), "m": s.head(texturedQuadDoc)}
	plan, doc := s.build([]Placement{place("t", "t"), place("m", "m")}, heads)

	base := plan.Segments[1].OutOffset
	assert.Equal(s.T(), base, int64(44))
	for i, off := range []int{0, 48, 80, 92} {
		assert.Equal(s.T(), doc.BufferViews[2+i].ByteOffset, int(base)+off)
	}
	assert.Equal(s.T(), doc.BufferViews[0].ByteOffset, 0)
	assert.Equal(s.T(), plan.BinLength, int64(44+108))
	checkIndices(s.T(), doc, plan.BinLength)
}

func (s *BuildSuite) TestRemapsMeshopt() {
	heads := map[string]Head{"t": s.head(triangleDoc), "m": s.head(meshoptDoc)}
	plan, doc := s.build([]Placement{place("t", "t"), place("m", "m")}, heads)

	assert.Equal(s.T(), len(doc.Buffers), 2)
	assert.Equal(s.T(), doc.Buffers[0].ByteLength, int(plan.BinLength))
	assert.Equal(s.T(), doc.Buffers[1].ByteLength, 36)
	assert.Equal(s.T(), string(doc.Buffers[1].Extensions["EXT_meshopt_compression"].(json.RawMessage)), `{"fallback":true}`)

	view := doc.BufferViews[2] // the model's positions, on the fallback buffer
	assert.Equal(s.T(), view.Buffer, 1)
	assert.Equal(s.T(), view.ByteOffset, 0)
	p := s.payload(view.Extensions["EXT_meshopt_compression"])
	assert.DeepEqual(s.T(), p, testPayload{Buffer: 0, ByteOffset: 8 + 44, ByteLength: 20, ByteStride: 12, Count: 3, Mode: "ATTRIBUTES", Filter: "NONE"})
	assert.Equal(s.T(), doc.BufferViews[3].ByteOffset, 28+44)
	checkIndices(s.T(), doc, plan.BinLength)
}

func (s *BuildSuite) TestUnionsExtensions() {
	heads := map[string]Head{
		"t": s.head(triangleDoc), "a": s.head(texturedQuadDoc), "b": s.head(texturedQuadDoc), "m": s.head(meshoptDoc),
	}
	plan, doc := s.build([]Placement{place("t", "t"), place("m", "m"), place("a", "a"), place("b", "b")}, heads)

	want := []string{"EXT_meshopt_compression", "KHR_texture_basisu"}
	assert.DeepEqual(s.T(), doc.ExtensionsUsed, want)
	assert.DeepEqual(s.T(), doc.ExtensionsRequired, want)
	assert.DeepEqual(s.T(), plan.Required, want)
}

// Review focus 1: the viewer keeps a model's root transforms under the placement.
func (s *BuildSuite) TestKeepsModelRootTransforms() {
	heads := map[string]Head{"t": s.head(triangleDoc), "m": s.head(rootTransformDoc)}
	_, doc := s.build([]Placement{place("t", "t"), place("m", "m")}, heads)

	pn := doc.Nodes[doc.Scenes[0].Nodes[1]]
	assert.Equal(s.T(), len(pn.Children), 2)
	root0, root1 := doc.Nodes[pn.Children[0]], doc.Nodes[pn.Children[1]]
	assert.Equal(s.T(), root0.Name, "root0")
	assert.Equal(s.T(), root1.Name, "root1")
	assert.DeepEqual(s.T(), root0.Translation, [3]float64{1, 2, 3})
	assert.Equal(s.T(), doc.Nodes[root0.Children[0]].Name, "child")
	assert.Equal(s.T(), *doc.Nodes[root0.Children[0]].Mesh, 1)
}

// Review focus 2: quotes and Cyrillic in a label survive the JSON.
func (s *BuildSuite) TestNameIsEscaped() {
	name := `Резервуар "A"`
	_, doc := s.build([]Placement{place("t", name)}, map[string]Head{"t": s.head(triangleDoc)})

	assert.Equal(s.T(), doc.Nodes[0].Name, name)
}

// Review focus 3: an input BIN that is not a multiple of 4 still leaves the
// next input 4-aligned.
func (s *BuildSuite) TestAlignsUnpaddedBin() {
	a, _ := triangleDoc()
	b, _ := triangleDoc()
	heads := map[string]Head{"a": {Doc: a, BinLength: 42}, "b": {Doc: b, BinLength: 42}}
	plan, doc := s.build([]Placement{place("a", "a"), place("b", "b")}, heads)

	assert.Equal(s.T(), plan.Segments[1].OutOffset, int64(44))
	assert.Equal(s.T(), plan.BinLength, int64(88))
	assert.Equal(s.T(), doc.BufferViews[2].ByteOffset, 44)
}

func (s *BuildSuite) TestGolden() {
	heads := map[string]Head{"t": s.head(triangleDoc), "q": s.head(texturedQuadDoc)}
	plan, _ := s.build([]Placement{
		place("t", "Ust-Kut"),
		{Hash: "q", Name: "tank-1", Translation: [3]float64{0.5, 0, -0.25}, Rotation: [3]float64{0, 1.5, 0}, Scale: [3]float64{1, 1, 1}},
		{Hash: "q", Name: "tank-2", Translation: [3]float64{-0.5, 0, 0.25}, Scale: [3]float64{2, 2, 2}},
	}, heads)

	var out bytes.Buffer
	assert.NilError(s.T(), json.Indent(&out, plan.JSON, "", "  "))
	golden.Assert(s.T(), out.String(), "export.golden.json")
}
