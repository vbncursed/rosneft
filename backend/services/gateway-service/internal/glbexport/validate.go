package glbexport

import (
	"encoding/json"
	"slices"

	"github.com/qmuntal/gltf"
)

const extMeshopt = "EXT_meshopt_compression"

// allowedExtensions are the ones the merge knows how to carry: the first two
// hold indices that remap.go shifts, the last two hold none.
var allowedExtensions = []string{
	extMeshopt,
	"KHR_texture_basisu",
	"KHR_mesh_quantization",
	"KHR_texture_transform",
}

// Validate refuses what the merge would silently corrupt. A pipeline change
// that starts emitting any of it fails here, in a test, not in a user's file.
// The checks run in this order; the first refusal is the one reported.
func Validate(doc *gltf.Document) error {
	for _, check := range []func(*gltf.Document) error{
		checkNoAnimationSkinCamera,
		checkExtensions,
		checkNoNil,
		checkNoSparse,
		checkBuffers,
		checkImages,
	} {
		if err := check(doc); err != nil {
			return err
		}
	}
	return nil
}

func checkNoAnimationSkinCamera(doc *gltf.Document) error {
	switch {
	case len(doc.Animations) > 0:
		return unsupported("animations")
	case len(doc.Skins) > 0:
		return unsupported("skins")
	case len(doc.Cameras) > 0:
		return unsupported("cameras")
	}
	return nil
}

func checkExtensions(doc *gltf.Document) error {
	for _, name := range slices.Concat(doc.ExtensionsUsed, doc.ExtensionsRequired) {
		if !slices.Contains(allowedExtensions, name) {
			return unsupported("extension %s", name)
		}
	}
	return nil
}

func checkNoNil(doc *gltf.Document) error {
	if hasNil(doc) {
		return malformed("null array element")
	}
	return nil
}

func checkNoSparse(doc *gltf.Document) error {
	for _, a := range doc.Accessors {
		if a.Sparse != nil {
			return unsupported("sparse accessor")
		}
	}
	return nil
}

func checkBuffers(doc *gltf.Document) error {
	for i, b := range doc.Buffers {
		if b.URI != "" {
			return unsupported("buffer %d has a uri", i)
		}
		if i > 0 && !isFallback(b.Extensions) {
			return unsupported("buffer %d is not a meshopt fallback", i)
		}
	}
	return nil
}

func checkImages(doc *gltf.Document) error {
	for i, im := range doc.Images {
		if im.URI != "" {
			return unsupported("image %d has a uri", i)
		}
	}
	return nil
}

// hasNil reports a JSON null where an object belongs, which would panic later.
func hasNil(d *gltf.Document) bool {
	if slices.Contains([]bool{
		slices.Contains(d.Accessors, nil),
		slices.Contains(d.BufferViews, nil),
		slices.Contains(d.Buffers, nil),
		slices.Contains(d.Images, nil),
		slices.Contains(d.Materials, nil),
		slices.Contains(d.Meshes, nil),
		slices.Contains(d.Nodes, nil),
		slices.Contains(d.Samplers, nil),
		slices.Contains(d.Scenes, nil),
		slices.Contains(d.Textures, nil),
	}, true) {
		return true
	}
	// Meshes hold no nil past this point, so m is safe to read.
	return slices.ContainsFunc(d.Meshes, func(m *gltf.Mesh) bool { return slices.Contains(m.Primitives, nil) })
}

// isFallback reports whether a buffer is gltfpack's data-less meshopt fallback.
func isFallback(ext map[string]any) bool {
	raw, ok := ext[extMeshopt].(json.RawMessage)
	if !ok {
		return false
	}
	var v struct{ Fallback bool }
	return json.Unmarshal(raw, &v) == nil && v.Fallback
}
