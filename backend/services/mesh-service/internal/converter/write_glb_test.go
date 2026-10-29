package converter

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

func glbDigest(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

var (
	quadPositions = []vertex{{0, 0, 0}, {1, 0, 0}, {1, 1, 0}, {0, 1, 0}, {0.5, 0.25, 2}}
	quadUVs       = []uv{{0, 0}, {1, 0}, {1, 1}, {0, 1}, {0.5, 0.5}}
	jpegA         = &textureAsset{Path: "a.jpg", Mime: "image/jpeg", Data: []byte("\xff\xd8jpeg-a")}
	jpegAAgain    = &textureAsset{Path: "a.jpg", Mime: "image/jpeg", Data: []byte("\xff\xd8jpeg-a")}
	pngB          = &textureAsset{Path: "sub/b.png", Mime: "image/png", Data: []byte("\x89PNGpng-b")}
)

// Golden digests of the bytes writeGLB produced before it was split up; the
// output must stay byte-identical (plain float32 copies, no arithmetic).
func TestWriteGLBGoldenBytes(t *testing.T) {
	tri := func(a, b, c uint32) triangle { return triangle{a, b, c} }
	cases := []struct {
		name      string
		positions []vertex
		uvs       []uv
		groups    []materialGroup
		materials []glMaterial
		golden    string
	}{
		{
			name:      "colour only, no uvs",
			positions: quadPositions,
			groups:    []materialGroup{{name: "m", triangles: []triangle{tri(0, 1, 2), tri(0, 2, 3)}}},
			materials: []glMaterial{{Name: "red", BaseColor: [4]float32{1, 0, 0, 1}}},
			golden:    "c350aebfef8084929024f3690127382a5b04bbb936a51e693820bb9bba189f5f",
		},
		{
			name:      "uvs and a shared texture across two materials",
			positions: quadPositions,
			uvs:       quadUVs,
			groups: []materialGroup{
				{name: "m1", triangles: []triangle{tri(0, 1, 2)}},
				{name: "m2", triangles: []triangle{tri(0, 2, 3), tri(1, 2, 4)}},
			},
			materials: []glMaterial{
				{Name: "tex1", BaseColor: [4]float32{1, 1, 1, 1}, Texture: jpegA},
				{Name: "tex2", BaseColor: [4]float32{0.5, 0.25, 0.125, 1}, Texture: jpegAAgain},
			},
			golden: "1212c3e7966e4f56983b8bc5cc8c10cedd4a0d31f450198c102a0d74ebb9c8b9",
		},
		{
			name:      "two textures, alpha blend, empty group skipped",
			positions: quadPositions,
			uvs:       quadUVs,
			groups: []materialGroup{
				{name: "m1", triangles: []triangle{tri(0, 1, 2)}},
				{name: "empty"},
				{name: "m3", triangles: []triangle{tri(2, 3, 4)}},
				{name: "m4", triangles: []triangle{tri(0, 3, 4)}},
			},
			materials: []glMaterial{
				{Name: "a", BaseColor: [4]float32{0.1, 0.2, 0.3, 0.5}, Texture: jpegA},
				{Name: "skipped", BaseColor: [4]float32{0, 0, 0, 1}},
				{Name: "b", BaseColor: [4]float32{0.9, 0.8, 0.7, 1}, Texture: pngB},
				{Name: "plain", BaseColor: [4]float32{0.3, 0.3, 0.3, 0.999}},
			},
			golden: "f0527d5af7a3e106eda1e279aca5f793c6799d15ac5084ac38348d9dab0728e1",
		},
		{
			name:      "texture present but no uvs is dropped",
			positions: quadPositions,
			groups:    []materialGroup{{name: "m", triangles: []triangle{tri(0, 1, 2)}}},
			materials: []glMaterial{{Name: "t", BaseColor: [4]float32{1, 1, 1, 1}, Texture: jpegA}},
			golden:    "bde850373a487823734c9ddc76751ca5746e3683a118009f2d117285604bb9a7",
		},
		{
			name:      "empty but non-nil uvs still count as uvs",
			positions: []vertex{{0, 0, 0}, {1, 0, 0}, {0, 1, 0}},
			uvs:       []uv{},
			groups:    []materialGroup{{name: "m", triangles: []triangle{tri(0, 1, 2)}}},
			materials: []glMaterial{{Name: "t", BaseColor: [4]float32{1, 1, 1, 1}, Texture: pngB}},
			golden:    "49dbee56d20d062567b2b66880d3ca78dbf437e5fef474af5db905887f224159",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := writeGLB(c.positions, c.uvs, c.groups, c.materials)
			assert.NilError(t, err)
			assert.Equal(t, glbDigest(got), c.golden)
		})
	}
}

func TestWriteGLBErrors(t *testing.T) {
	tri := []triangle{{0, 1, 2}}

	_, err := writeGLB(quadPositions, nil, []materialGroup{{triangles: tri}}, nil)
	assert.Equal(t, err.Error(), "writeGLB: groups (1) and materials (0) length mismatch")

	_, err = writeGLB(quadPositions, nil, []materialGroup{{name: "e"}}, []glMaterial{{Name: "e"}})
	assert.Assert(t, errors.Is(err, domain.ErrBadSource), "got %v", err)
	assert.ErrorContains(t, err, "writeGLB: ")
	assert.ErrorContains(t, err, "no non-empty primitives")

	_, err = writeGLB(nil, nil, nil, nil)
	assert.Assert(t, errors.Is(err, domain.ErrBadSource), "got %v", err)
}
