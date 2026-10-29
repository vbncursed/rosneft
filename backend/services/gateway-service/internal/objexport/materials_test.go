package objexport

import (
	"testing"

	"github.com/qmuntal/gltf"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

type MaterialsSuite struct{ suite.Suite }

func TestMaterialsSuite(t *testing.T) { suite.Run(t, new(MaterialsSuite)) }

// Every refusal image makes, with its exact text. The cases that fail on two
// counts pin the order: TEXCOORD, texture range, source, image range, MIME
// type, bufferView, the view itself.
func (s *MaterialsSuite) TestImageRefusals() {
	cases := []struct {
		name   string
		mutate func(d *gltf.Document)
		want   error
		msg    string
	}{
		{
			"texCoord 1",
			func(d *gltf.Document) { d.Materials[0].PBRMetallicRoughness.BaseColorTexture.TexCoord = 1 },
			ErrUnsupported,
			"objexport: unsupported glTF feature: baseColorTexture uses TEXCOORD_1",
		},
		{
			"texCoord is refused before the texture index",
			func(d *gltf.Document) {
				d.Materials[0].PBRMetallicRoughness.BaseColorTexture.TexCoord = 2
				d.Materials[0].PBRMetallicRoughness.BaseColorTexture.Index = 9
			},
			ErrUnsupported,
			"baseColorTexture uses TEXCOORD_2",
		},
		{
			"texture one past the end",
			func(d *gltf.Document) { d.Materials[0].PBRMetallicRoughness.BaseColorTexture.Index = 1 },
			ErrMalformed,
			"objexport: malformed glb: texture 1 out of range [0, 1)",
		},
		{
			"negative texture",
			func(d *gltf.Document) { d.Materials[0].PBRMetallicRoughness.BaseColorTexture.Index = -1 },
			ErrMalformed,
			"objexport: malformed glb: texture -1 out of range [0, 1)",
		},
		{
			"texture without a source",
			func(d *gltf.Document) { d.Textures[0].Source = nil },
			ErrUnsupported,
			"objexport: unsupported glTF feature: texture 0 has no source",
		},
		{
			"image one past the end",
			func(d *gltf.Document) { d.Textures[0].Source = new(1) },
			ErrMalformed,
			"objexport: malformed glb: image 1 out of range [0, 1)",
		},
		{
			"negative image",
			func(d *gltf.Document) { d.Textures[0].Source = new(-1) },
			ErrMalformed,
			"objexport: malformed glb: image -1 out of range [0, 1)",
		},
		{
			"gif",
			func(d *gltf.Document) { d.Images[0].MimeType = "image/gif" },
			ErrUnsupported,
			`objexport: unsupported glTF feature: image 0 is "image/gif"`,
		},
		{
			"no MIME type",
			func(d *gltf.Document) { d.Images[0].MimeType = "" },
			ErrUnsupported,
			`objexport: unsupported glTF feature: image 0 is ""`,
		},
		{
			"image outside a bufferView",
			func(d *gltf.Document) { d.Images[0].BufferView = nil },
			ErrUnsupported,
			"objexport: unsupported glTF feature: image 0 is not in a bufferView",
		},
		{
			"MIME type is refused before the bufferView",
			func(d *gltf.Document) { d.Images[0].BufferView, d.Images[0].MimeType = nil, "image/webp" },
			ErrUnsupported,
			`image 0 is "image/webp"`,
		},
		{
			"bufferView one past the end",
			func(d *gltf.Document) { d.Images[0].BufferView = new(len(d.BufferViews)) },
			ErrMalformed,
			"objexport: malformed glb:",
		},
		{
			"bufferView past the BIN",
			func(d *gltf.Document) { d.BufferViews[3].ByteLength = 1 << 20 },
			ErrMalformed,
			"objexport: malformed glb:",
		},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			doc, bin := validDoc()
			tc.mutate(doc)

			_, err := Build(
				[]glbexport.Placement{place("x", "x")},
				map[string]glbexport.Head{"x": loose(doc, int64(len(bin)))},
				testOpts(),
			)

			assert.ErrorIs(s.T(), err, tc.want)
			assert.ErrorContains(s.T(), err, tc.msg)
		})
	}
}

// Images are numbered in the order materials first reach them, and each ships
// its own bytes under its own extension.
func (s *MaterialsSuite) TestImagesNumberedInFirstUseOrder() {
	doc, bin := docOf(tri(corners...), tri(corners...))
	bin, first := withImage(doc, bin, "a.jpg", "image/jpeg")
	bin, second := withImage(doc, bin, "b.png", "image/png")
	// the material that reaches "b" is numbered first
	doc.Meshes[0].Primitives[0].Material = new(withMaterial(doc, "B", second, [4]float64{1, 1, 1, 1}))
	doc.Meshes[0].Primitives[1].Material = new(withMaterial(doc, "A", first, [4]float64{1, 1, 1, 0.5}))

	files, names := export(
		s.T(),
		[]glbexport.Placement{place("m", "one")},
		map[string][]byte{"m": glbOf(s.T(), doc, bin)},
		testOpts(),
	)

	assert.DeepEqual(s.T(), names, []string{"README.txt", "ust-kut.mtl", "t000_b.png", "t001_a.jpg", "ust-kut.obj"})
	assert.Equal(s.T(), files["t000_b.png"], "img:b.png")
	assert.Equal(s.T(), files["t001_a.jpg"], "img:a.jpg")
}
