package objexport

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/qmuntal/gltf"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

type WriteSuite struct{ suite.Suite }

func TestWriteSuite(t *testing.T) { suite.Run(t, new(WriteSuite)) }

var corners = [][3]float32{{0, 0, 0}, {1, 0, 0}, {0, 1, 0}}

// single exports doc as the one placement "x" and returns OBJ and MTL.
func (s *WriteSuite) single(doc *gltf.Document, bin []byte) (string, string) {
	obj, mtl := objOf(
		s.T(),
		[]glbexport.Placement{place("x", "X")},
		map[string][]byte{"x": glbOf(s.T(), doc, bin)},
		testOpts(),
	)
	return obj, mtl
}

func (s *WriteSuite) TestIndexFormats() {
	for _, comp := range []gltf.ComponentType{gltf.ComponentUbyte, gltf.ComponentUshort, gltf.ComponentUint} {
		s.Run(fmt.Sprint(comp), func() {
			m := tri(corners...)
			m.uv, m.comp = [][2]float32{{0, 0}, {1, 0}, {0, 1}}, comp

			obj, _ := s.single(docOf(m))

			assert.Equal(s.T(), line(obj, "f "), "f 1/1 2/2 3/3")
		})
	}
}

func (s *WriteSuite) TestInterleavedStride() {
	m := tri([3]float32{1, 2, 3}, [3]float32{4, 5, 6}, [3]float32{7, 8, 9})
	m.uv, m.interleave = [][2]float32{{0.5, 0.5}, {0.25, 0.25}, {1, 1}}, true

	obj, _ := s.single(docOf(m))

	assert.Assert(s.T(), strings.Contains(obj, "v 1 -3 2\nv 4 -6 5\nv 7 -9 8\nvt 0.5 0.5\nvt 0.25 0.75\nvt 1 0\n"), obj)
}

func (s *WriteSuite) TestTwoPrimitivesShareBlocks() {
	m := tri(corners...)
	m.uv = [][2]float32{{0, 0}, {1, 0}, {0, 1}}
	doc, bin := docOf(m)
	second := *doc.Meshes[0].Primitives[0]
	doc.Meshes[0].Primitives = append(doc.Meshes[0].Primitives, &second)

	obj, _ := s.single(doc, bin)

	assert.Equal(s.T(), strings.Count(obj, "\nv "), 3)
	assert.Equal(s.T(), strings.Count(obj, "\nvt "), 3)
	assert.Equal(s.T(), strings.Count(obj, "\nusemtl "), 2)
}

func (s *WriteSuite) TestNoUVs() {
	obj, _ := s.single(docOf(tri(corners...)))

	assert.Assert(s.T(), !strings.Contains(obj, "vt "))
	assert.Equal(s.T(), line(obj, "f "), "f 1 2 3")
}

func (s *WriteSuite) TestNoMaterialUsesDefault() {
	obj, mtl := s.single(docOf(tri(corners...)))

	assert.Equal(s.T(), line(obj, "usemtl "), "usemtl default")
	assert.Equal(s.T(), strings.Count(mtl, "newmtl "), 1)
	assert.Assert(s.T(), strings.HasSuffix(mtl, "newmtl default\nKd 1 1 1\nKs 0 0 0\nNs 0\nillum 1\n\n"), mtl)
}

// run builds and writes ps over blobs with src as the Opener.
func (s *WriteSuite) run(
	ctx context.Context,
	ps []glbexport.Placement,
	blobs map[string][]byte,
	src *source,
) ([]byte, error) {
	heads := map[string]glbexport.Head{}
	for h, b := range blobs {
		heads[h] = headOf(s.T(), b)
	}
	plan, err := Build(ps, heads, testOpts())
	assert.NilError(s.T(), err)
	var out bytes.Buffer
	err = Write(ctx, &out, plan, src.open)
	return out.Bytes(), err
}

func (s *WriteSuite) TestImageSharedByTwoMaterialsShipsOnce() {
	a := tri(corners...)
	b := tri(corners...)
	doc, bin := docOf(a, b)
	bin, tex := withImage(doc, bin, "shared.png", "image/png")
	doc.Meshes[0].Primitives[0].Material = new(withMaterial(doc, "A", tex, [4]float64{1, 1, 1, 1}))
	doc.Meshes[0].Primitives[1].Material = new(withMaterial(doc, "B", tex, [4]float64{1, 1, 1, 1}))
	blob := glbOf(s.T(), doc, bin)
	src := &source{blobs: map[string][]byte{"m": blob}}

	out, err := s.run(s.T().Context(), []glbexport.Placement{place("m", "one"), place("m", "two")}, src.blobs, src)

	assert.NilError(s.T(), err)
	_, names := unzip(s.T(), out)
	assert.DeepEqual(s.T(), names, []string{"README.txt", "ust-kut.mtl", "t000_shared.png", "ust-kut.obj"})
	h := headOf(s.T(), blob)
	imageCall := fmt.Sprintf("m@%d", h.BinOffset+int64(doc.BufferViews[len(doc.BufferViews)-1].ByteOffset))
	n := 0
	for _, c := range src.calls {
		if c == imageCall {
			n++
		}
	}
	assert.Equal(s.T(), n, 1, src.calls)
}

func (s *WriteSuite) TestIndexPastCountAbortsTheArchive() {
	m := tri(corners...)
	m.idx = []uint32{0, 1, 3}
	doc, bin := docOf(m)
	src := &source{blobs: map[string][]byte{"x": glbOf(s.T(), doc, bin)}}

	out, err := s.run(s.T().Context(), []glbexport.Placement{place("x", "X")}, src.blobs, src)

	assert.ErrorIs(s.T(), err, ErrMalformed)
	_, zerr := zip.NewReader(bytes.NewReader(out), int64(len(out)))
	assert.Assert(s.T(), zerr != nil, "a cut archive must have no central directory")
}

func (s *WriteSuite) TestWriteStopsOnCancelledContext() {
	doc, bin := docOf(tri(corners...))
	src := &source{blobs: map[string][]byte{"x": glbOf(s.T(), doc, bin)}}
	ctx, cancel := context.WithCancel(s.T().Context())
	cancel()

	_, err := s.run(ctx, []glbexport.Placement{place("x", "X")}, src.blobs, src)

	assert.ErrorIs(s.T(), err, context.Canceled)
	assert.Equal(s.T(), len(src.calls), 0)
}

func (s *WriteSuite) TestOpenerFailureIsReturned() {
	doc, bin := docOf(tri(corners...))
	boom := errors.New("asset died")
	src := &source{blobs: map[string][]byte{"x": glbOf(s.T(), doc, bin)}}
	heads := map[string]glbexport.Head{"x": headOf(s.T(), src.blobs["x"])}
	plan, err := Build([]glbexport.Placement{place("x", "X")}, heads, testOpts())
	assert.NilError(s.T(), err)
	src.err = boom

	err = Write(s.T().Context(), &bytes.Buffer{}, plan, src.open)

	assert.ErrorIs(s.T(), err, boom)
}
