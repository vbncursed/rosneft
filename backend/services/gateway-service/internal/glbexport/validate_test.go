package glbexport

import (
	"encoding/json"
	"testing"

	"github.com/qmuntal/gltf"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type ValidateSuite struct{ suite.Suite }

func TestValidateSuite(t *testing.T) { suite.Run(t, new(ValidateSuite)) }

// Each rejection of Validate, with the error kind and the exact text a
// caller (and the user's 422/409 body) sees.
func (s *ValidateSuite) TestRefusals() {
	const un, mal = "glbexport: unsupported glTF feature: ", "glbexport: malformed glb: "
	cases := []struct {
		name   string
		base   fixture
		mutate func(d *gltf.Document)
		want   error
		text   string
	}{
		{
			"animations",
			triangleDoc,
			func(d *gltf.Document) { d.Animations = []*gltf.Animation{{}} },
			ErrUnsupported,
			un + "animations",
		},
		{"skins", triangleDoc, func(d *gltf.Document) { d.Skins = []*gltf.Skin{{}} }, ErrUnsupported, un + "skins"},
		{
			"cameras",
			triangleDoc,
			func(d *gltf.Document) { d.Cameras = []*gltf.Camera{{}} },
			ErrUnsupported,
			un + "cameras",
		},
		{"animations win over skins", triangleDoc, func(d *gltf.Document) {
			d.Animations, d.Skins = []*gltf.Animation{{}}, []*gltf.Skin{{}}
		}, ErrUnsupported, un + "animations"},
		{"used extension", triangleDoc, func(d *gltf.Document) {
			d.ExtensionsUsed = []string{"KHR_draco_mesh_compression"}
		}, ErrUnsupported, un + "extension KHR_draco_mesh_compression"},
		{"required extension", triangleDoc, func(d *gltf.Document) {
			d.ExtensionsRequired = []string{"KHR_materials_unlit"}
		}, ErrUnsupported, un + "extension KHR_materials_unlit"},
		{"extension beats a null element", triangleDoc, func(d *gltf.Document) {
			d.ExtensionsUsed = []string{"X"}
			d.Nodes = append(d.Nodes, nil)
		}, ErrUnsupported, un + "extension X"},
		{
			"null accessor",
			triangleDoc,
			func(d *gltf.Document) { d.Accessors = append(d.Accessors, nil) },
			ErrMalformed,
			mal + "null array element",
		},
		{
			"null bufferView",
			triangleDoc,
			func(d *gltf.Document) { d.BufferViews = append(d.BufferViews, nil) },
			ErrMalformed,
			mal + "null array element",
		},
		{
			"null buffer",
			triangleDoc,
			func(d *gltf.Document) { d.Buffers = append(d.Buffers, nil) },
			ErrMalformed,
			mal + "null array element",
		},
		{
			"null image",
			triangleDoc,
			func(d *gltf.Document) { d.Images = []*gltf.Image{nil} },
			ErrMalformed,
			mal + "null array element",
		},
		{
			"null material",
			triangleDoc,
			func(d *gltf.Document) { d.Materials = []*gltf.Material{nil} },
			ErrMalformed,
			mal + "null array element",
		},
		{
			"null mesh",
			triangleDoc,
			func(d *gltf.Document) { d.Meshes = append(d.Meshes, nil) },
			ErrMalformed,
			mal + "null array element",
		},
		{
			"null node",
			triangleDoc,
			func(d *gltf.Document) { d.Nodes = append(d.Nodes, nil) },
			ErrMalformed,
			mal + "null array element",
		},
		{
			"null sampler",
			triangleDoc,
			func(d *gltf.Document) { d.Samplers = []*gltf.Sampler{nil} },
			ErrMalformed,
			mal + "null array element",
		},
		{
			"null scene",
			triangleDoc,
			func(d *gltf.Document) { d.Scenes = append(d.Scenes, nil) },
			ErrMalformed,
			mal + "null array element",
		},
		{
			"null texture",
			triangleDoc,
			func(d *gltf.Document) { d.Textures = []*gltf.Texture{nil} },
			ErrMalformed,
			mal + "null array element",
		},
		{"null primitive", triangleDoc, func(d *gltf.Document) {
			d.Meshes[0].Primitives = append(d.Meshes[0].Primitives, nil)
		}, ErrMalformed, mal + "null array element"},
		{"sparse accessor", triangleDoc, func(d *gltf.Document) {
			d.Accessors[0].Sparse = &gltf.Sparse{Count: 1}
		}, ErrUnsupported, un + "sparse accessor"},
		{
			"buffer uri",
			triangleDoc,
			func(d *gltf.Document) { d.Buffers[0].URI = "a.bin" },
			ErrUnsupported,
			un + "buffer 0 has a uri",
		},
		{"extra buffer without fallback", triangleDoc, func(d *gltf.Document) {
			d.Buffers = append(d.Buffers, &gltf.Buffer{ByteLength: 4})
		}, ErrUnsupported, un + "buffer 1 is not a meshopt fallback"},
		{"extra buffer with uri", meshoptDoc, func(d *gltf.Document) {
			d.Buffers[1].URI = "x.bin"
		}, ErrUnsupported, un + "buffer 1 has a uri"},
		{
			"image uri",
			texturedQuadDoc,
			func(d *gltf.Document) { d.Images[0].URI = "a.png" },
			ErrUnsupported,
			un + "image 0 has a uri",
		},
		{"sparse beats buffer uri", triangleDoc, func(d *gltf.Document) {
			d.Accessors[0].Sparse = &gltf.Sparse{Count: 1}
			d.Buffers[0].URI = "a.bin"
		}, ErrUnsupported, un + "sparse accessor"},
		{"buffer uri beats image uri", texturedQuadDoc, func(d *gltf.Document) {
			d.Buffers[0].URI = "a.bin"
			d.Images[0].URI = "a.png"
		}, ErrUnsupported, un + "buffer 0 has a uri"},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			doc, _ := tc.base()
			tc.mutate(doc)

			err := Validate(doc)

			assert.ErrorIs(s.T(), err, tc.want)
			assert.Error(s.T(), err, tc.text)
		})
	}
}

func (s *ValidateSuite) TestAccepts() {
	for name, base := range map[string]fixture{
		"triangle":     triangleDoc,
		"textured":     texturedQuadDoc,
		"meshopt":      meshoptDoc,
		"plain quad":   plainQuadDoc,
		"root + child": rootTransformDoc,
	} {
		s.Run(name, func() {
			doc, _ := base()
			assert.NilError(s.T(), Validate(doc))
		})
	}
}

func (s *ValidateSuite) TestEveryAllowedExtensionPasses() {
	doc, _ := triangleDoc()
	doc.ExtensionsUsed = allowedExtensions
	doc.ExtensionsRequired = allowedExtensions
	assert.NilError(s.T(), Validate(doc))
}

func (s *ValidateSuite) TestIsFallback() {
	cases := map[string]struct {
		ext  map[string]any
		want bool
	}{
		"fallback true":   {map[string]any{extMeshopt: json.RawMessage(`{"fallback":true}`)}, true},
		"fallback false":  {map[string]any{extMeshopt: json.RawMessage(`{"fallback":false}`)}, false},
		"no flag":         {map[string]any{extMeshopt: json.RawMessage(`{}`)}, false},
		"not json":        {map[string]any{extMeshopt: json.RawMessage(`{`)}, false},
		"not raw message": {map[string]any{extMeshopt: map[string]any{"fallback": true}}, false},
		"absent":          {map[string]any{"other": json.RawMessage(`{"fallback":true}`)}, false},
		"nil map":         {nil, false},
	}
	for name, tc := range cases {
		s.Run(name, func() { assert.Equal(s.T(), isFallback(tc.ext), tc.want) })
	}
}
