package converter

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/qmuntal/gltf"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

// fakePostprocessor satisfies the converter's Compressor interface.
type fakePostprocessor struct {
	compressFn func(ctx context.Context, glb []byte) ([]byte, error)
	simplifyFn func(ctx context.Context, glb []byte, ratio float64) ([]byte, error)
}

func (f *fakePostprocessor) Compress(ctx context.Context, glb []byte) ([]byte, error) {
	if f.compressFn != nil {
		return f.compressFn(ctx, glb)
	}
	return glb, nil
}

func (f *fakePostprocessor) Simplify(ctx context.Context, glb []byte, ratio float64) ([]byte, error) {
	return f.simplifyFn(ctx, glb, ratio)
}

type ConvertLODsSuite struct {
	suite.Suite
	objPath string
}

func TestConvertLODsSuite(t *testing.T) {
	suite.Run(t, new(ConvertLODsSuite))
}

// SetupTest writes a one-triangle OBJ so the tests exercise the real
// ConvertLODs instead of a copy of its loop. The previous version of this
// file duplicated that loop in a test helper to avoid needing a file — which
// is exactly why it stayed green while ConvertLODs fed the LOD pass the
// compressed artifact instead of the raw GLB.
func (s *ConvertLODsSuite) SetupTest() {
	dir := s.T().TempDir()
	s.objPath = filepath.Join(dir, "tri.obj")
	obj := "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"
	assert.NilError(s.T(), os.WriteFile(s.objPath, []byte(obj), 0o600))
}

func (s *ConvertLODsSuite) TestNoCompressor_returnsLOD0Only() {
	c := &Converter{lodRatios: []float64{0.5}}

	out, err := c.ConvertLODs(s.T().Context(), filepath.Dir(s.objPath), s.objPath)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 1)
}

func (s *ConvertLODsSuite) TestAppendsForEachRatio() {
	calls := 0
	pp := &fakePostprocessor{
		simplifyFn: func(_ context.Context, _ []byte, _ float64) ([]byte, error) {
			calls++
			return []byte("simplified"), nil
		},
	}
	c := &Converter{compressor: pp, lodRatios: []float64{0.5, 0.25}}

	out, err := c.ConvertLODs(s.T().Context(), filepath.Dir(s.objPath), s.objPath)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 3)
	assert.Equal(s.T(), calls, 2)
	assert.Equal(s.T(), out[1].ContentType, "model/gltf-binary")
}

func (s *ConvertLODsSuite) TestPerLODErrorTolerated() {
	pp := &fakePostprocessor{
		simplifyFn: func(_ context.Context, _ []byte, ratio float64) ([]byte, error) {
			if ratio == 0.25 {
				return nil, errors.New("encoder boom")
			}
			return []byte("ok"), nil
		},
	}
	c := &Converter{compressor: pp, lodRatios: []float64{0.5, 0.25}}

	out, err := c.ConvertLODs(s.T().Context(), filepath.Dir(s.objPath), s.objPath)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 2) // LOD0 + LOD1; LOD2 dropped
}

// TestSimplifiesRawNotCompressed is the regression this whole change exists
// for. gltfpack cannot decode Basis Universal, so a LOD pass fed the
// compressed artifact can only touch geometry and every LOD keeps
// full-resolution textures.
func (s *ConvertLODsSuite) TestSimplifiesRawNotCompressed() {
	var seen [][]byte
	pp := &fakePostprocessor{
		compressFn: func(_ context.Context, _ []byte) ([]byte, error) {
			return []byte("COMPRESSED"), nil
		},
		simplifyFn: func(_ context.Context, glb []byte, _ float64) ([]byte, error) {
			seen = append(seen, glb)
			return []byte("ok"), nil
		},
	}
	c := &Converter{compressor: pp, lodRatios: []float64{0.5, 0.25}}

	out, err := c.ConvertLODs(s.T().Context(), filepath.Dir(s.objPath), s.objPath)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), string(out[0].Content), "COMPRESSED")
	assert.Equal(s.T(), len(seen), 2)
	for _, got := range seen {
		assert.Assert(s.T(), string(got) != "COMPRESSED",
			"LOD pass received the compressed artifact, not the raw GLB")
		assert.Assert(s.T(), len(got) > 0)
	}
}

// A simplifier that hands the same GLB back stands in for gltfpack: the
// bytes are a real GLB, so the LOD carries real counts.
func (s *ConvertLODsSuite) TestLODsCarryTheirOwnCountsAndLOD0Bbox() {
	c := &Converter{
		lodRatios: []float64{0.5},
		compressor: &fakePostprocessor{
			simplifyFn: func(_ context.Context, glb []byte, _ float64) ([]byte, error) { return glb, nil },
		},
	}

	out, err := c.ConvertLODs(s.T().Context(), filepath.Dir(s.objPath), s.objPath)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 2)
	assert.Equal(s.T(), out[1].Vertices, uint64(3))
	assert.Equal(s.T(), out[1].Faces, uint64(1))
	assert.Equal(s.T(), out[1].BBoxMin, out[0].BBoxMin)
	assert.Equal(s.T(), out[1].BBoxMax, out[0].BBoxMax)
}

// A LOD whose bytes cannot be read still ships: the artifact is complete,
// only its stats are unknown, and the bbox is LOD0's either way.
func (s *ConvertLODsSuite) TestLODWithUnreadableBytesKeepsZeroCounts() {
	c := &Converter{
		lodRatios: []float64{0.5},
		compressor: &fakePostprocessor{
			simplifyFn: func(context.Context, []byte, float64) ([]byte, error) { return []byte("garbage"), nil },
		},
	}

	out, err := c.ConvertLODs(s.T().Context(), filepath.Dir(s.objPath), s.objPath)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 2)
	assert.Equal(s.T(), out[1].Faces, uint64(0))
	assert.Equal(s.T(), out[1].BBoxMax, out[0].BBoxMax)
}

// LOD0 keeps the uncompressed GLB it was packed from; the compatible export
// serves it. Lower LODs carry none.
func (s *ConvertLODsSuite) TestLOD0CarriesThePlainItWasMadeFrom() {
	var packedFrom []byte
	pp := &fakePostprocessor{
		compressFn: func(_ context.Context, glb []byte) ([]byte, error) {
			packedFrom = bytes.Clone(glb)
			return []byte("packed"), nil
		},
		simplifyFn: func(context.Context, []byte, float64) ([]byte, error) { return []byte("ok"), nil },
	}
	c := &Converter{compressor: pp, lodRatios: []float64{0.5, 0.25}}

	out, err := c.ConvertLODs(s.T().Context(), filepath.Dir(s.objPath), s.objPath)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 3)
	assert.DeepEqual(s.T(), out[0].Plain, packedFrom)
	sum := sha256.Sum256(out[0].Plain)
	assert.Equal(s.T(), out[0].PlainHash, hex.EncodeToString(sum[:]))
	for _, lod := range out[1:] {
		assert.Assert(s.T(), lod.Plain == nil)
		assert.Equal(s.T(), lod.PlainHash, "")
	}
}

func (s *ConvertLODsSuite) TestPlainIsAnExtensionFreeGLB() {
	c := &Converter{}

	out, err := c.ConvertLODs(s.T().Context(), filepath.Dir(s.objPath), s.objPath)

	assert.NilError(s.T(), err)
	var doc gltf.Document
	assert.NilError(s.T(), gltf.NewDecoder(bytes.NewReader(out[0].Plain)).Decode(&doc))
	assert.Equal(s.T(), len(doc.ExtensionsUsed), 0)
	assert.Equal(s.T(), len(doc.ExtensionsRequired), 0)
	pos := doc.Accessors[doc.Meshes[0].Primitives[0].Attributes[gltf.POSITION]]
	assert.Equal(s.T(), len(pos.Min), 3)
	assert.Equal(s.T(), len(pos.Max), 3)
}
