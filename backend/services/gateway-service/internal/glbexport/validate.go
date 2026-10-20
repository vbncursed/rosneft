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

// validate refuses what the merge would silently corrupt. A pipeline change
// that starts emitting any of it fails here, in a test, not in a user's file.
func validate(doc *gltf.Document) error {
	switch {
	case len(doc.Animations) > 0:
		return unsupported("animations")
	case len(doc.Skins) > 0:
		return unsupported("skins")
	case len(doc.Cameras) > 0:
		return unsupported("cameras")
	}
	for _, name := range slices.Concat(doc.ExtensionsUsed, doc.ExtensionsRequired) {
		if !slices.Contains(allowedExtensions, name) {
			return unsupported("extension %s", name)
		}
	}
	if hasNil(doc) {
		return malformed("null array element")
	}
	for _, a := range doc.Accessors {
		if a.Sparse != nil {
			return unsupported("sparse accessor")
		}
	}
	for i, b := range doc.Buffers {
		if b.URI != "" {
			return unsupported("buffer %d has a uri", i)
		}
		if i > 0 && !isFallback(b.Extensions) {
			return unsupported("buffer %d is not a meshopt fallback", i)
		}
	}
	for i, im := range doc.Images {
		if im.URI != "" {
			return unsupported("image %d has a uri", i)
		}
	}
	return nil
}

// hasNil reports a JSON null where an object belongs, which would panic later.
func hasNil(d *gltf.Document) bool {
	if slices.Contains(d.Accessors, nil) || slices.Contains(d.BufferViews, nil) ||
		slices.Contains(d.Buffers, nil) || slices.Contains(d.Images, nil) ||
		slices.Contains(d.Materials, nil) || slices.Contains(d.Meshes, nil) ||
		slices.Contains(d.Nodes, nil) || slices.Contains(d.Samplers, nil) ||
		slices.Contains(d.Scenes, nil) || slices.Contains(d.Textures, nil) {
		return true
	}
	for _, m := range d.Meshes {
		if slices.Contains(m.Primitives, nil) {
			return true
		}
	}
	return false
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
