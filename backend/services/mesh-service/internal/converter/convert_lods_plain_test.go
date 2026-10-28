package converter

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"image"
	"image/png"
	"os"
	"path/filepath"

	"github.com/qmuntal/gltf"
	"gotest.tools/v3/assert"
)

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

// The plain is what Blender gets: no extensions, and the source texture
// inside the GLB (a bufferView, never a URI the file cannot carry).
func (s *ConvertLODsSuite) TestPlainIsAnExtensionFreeGLBWithItsTextureInside() {
	dir := filepath.Dir(s.objPath)
	obj := "mtllib m.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nusemtl skin\nf 1/1 2/2 3/3\n"
	assert.NilError(s.T(), os.WriteFile(s.objPath, []byte(obj), 0o600))
	assert.NilError(
		s.T(),
		os.WriteFile(filepath.Join(dir, "m.mtl"), []byte("newmtl skin\nKd 1 1 1\nmap_Kd tex.png\n"), 0o600),
	)
	var img bytes.Buffer
	assert.NilError(s.T(), png.Encode(&img, image.NewRGBA(image.Rect(0, 0, 2, 2))))
	assert.NilError(s.T(), os.WriteFile(filepath.Join(dir, "tex.png"), img.Bytes(), 0o600))

	out, err := (&Converter{}).ConvertLODs(s.T().Context(), dir, s.objPath)

	assert.NilError(s.T(), err)
	var doc gltf.Document
	assert.NilError(s.T(), gltf.NewDecoder(bytes.NewReader(out[0].Plain)).Decode(&doc))
	assert.Equal(s.T(), len(doc.ExtensionsUsed), 0)
	assert.Equal(s.T(), len(doc.ExtensionsRequired), 0)
	pos := doc.Accessors[doc.Meshes[0].Primitives[0].Attributes[gltf.POSITION]]
	assert.Equal(s.T(), len(pos.Min), 3)
	assert.Equal(s.T(), len(pos.Max), 3)
	assert.Equal(s.T(), len(doc.Images), 1)
	assert.Equal(s.T(), doc.Images[0].URI, "")
	assert.Assert(s.T(), doc.Images[0].BufferView != nil)
	assert.Equal(s.T(), doc.Images[0].MimeType, "image/png")
}
