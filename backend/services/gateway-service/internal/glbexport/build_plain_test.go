package glbexport

import (
	"bytes"
	"testing"

	"github.com/qmuntal/gltf"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type BuildPlainSuite struct{ suite.Suite }

func TestBuildPlainSuite(t *testing.T) { suite.Run(t, new(BuildPlainSuite)) }

// export plans a plain territory plus one plain model placed three times.
func (s *BuildPlainSuite) export() (Plan, *gltf.Document) {
	blobs := map[string][]byte{}
	heads := map[string]Head{}
	for _, hash := range []string{"t", "m"} {
		doc, bin := plainQuadDoc()
		blobs[hash] = makeGLB(s.T(), doc, bin)
		h, err := ReadHead(bytes.NewReader(blobs[hash]))
		assert.NilError(s.T(), err)
		heads[hash] = h
	}
	ps := []Placement{place("t", "terrain"), place("m", "a"), place("m", "b"), place("m", "c")}
	plan, err := Build(ps, heads)
	assert.NilError(s.T(), err)
	var out bytes.Buffer
	assert.NilError(s.T(), Write(s.T().Context(), &out, plan, inMemory(blobs)))
	assert.Equal(s.T(), int64(out.Len()), plan.Size)
	doc := new(gltf.Document)
	assert.NilError(s.T(), gltf.NewDecoder(&out).Decode(doc))
	return plan, doc
}

func (s *BuildPlainSuite) TestPlainInputsRequireNothing() {
	plan, doc := s.export()

	assert.Equal(s.T(), len(plan.Required), 0)
	assert.Equal(s.T(), len(doc.ExtensionsUsed), 0)
	assert.Equal(s.T(), len(doc.ExtensionsRequired), 0)
	assert.Equal(s.T(), len(doc.Images), 2, "one image per distinct input")
	for _, img := range doc.Images {
		assert.Equal(s.T(), img.MimeType, "image/png")
	}
}

func (s *BuildPlainSuite) TestPlainExportDecodesEndToEnd() {
	_, doc := s.export()

	// 4 placement nodes + the territory's and each placement's copy of the quad node.
	assert.Assert(s.T(), len(doc.Nodes) >= 4, "nodes = %d", len(doc.Nodes))
	assert.Equal(s.T(), len(doc.Scenes[0].Nodes), 4)
}
