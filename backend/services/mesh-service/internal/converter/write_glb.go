package converter

import (
	"bytes"
	"fmt"

	"github.com/qmuntal/gltf"
	"github.com/qmuntal/gltf/modeler"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// textureAsset is one resolved image that can be reused across primitives.
// Path is the texture's location relative to the MTL — used as the cache key
// so we never embed the same JPEG twice when several materials reference it.
type textureAsset struct {
	Path string
	Mime string
	Data []byte
}

// glMaterial is the per-primitive material spec writeGLB consumes. baseColor
// is sRGB+alpha (already gamma-aware as glTF expects baseColorFactor in linear
// space — but Three.js, Blender, Babylon and pkg viewers all treat it as sRGB
// for consistency with map_Kd, so we pass Kd through verbatim). texture is nil
// for color-only materials.
type glMaterial struct {
	Name      string
	BaseColor [4]float32
	Texture   *textureAsset
}

// writeGLB emits a binary glTF (.glb) with one mesh that carries one primitive
// per group. Positions and UVs are deduplicated and shared across primitives
// — only the index buffers and material assignments differ. Texture images
// are embedded once; multiple materials referencing the same image reuse the
// glTF Texture index.
func writeGLB(positions []vertex, uvs []uv, groups []materialGroup, materials []glMaterial) ([]byte, error) {
	if len(groups) != len(materials) {
		return nil, fmt.Errorf("writeGLB: groups (%d) and materials (%d) length mismatch", len(groups), len(materials))
	}

	doc := gltf.NewDocument()
	doc.Asset.Generator = "rosneft mesh-worker"

	posIdx, uvIdx, hasUVs := writeVertexData(doc, positions, uvs)
	layout := vertexLayout{
		position: posIdx,
		uv:       uvIdx,
		hasUVs:   hasUVs,
		sampler:  addSampler(doc),
	}

	prims, err := buildPrimitives(doc, groups, materials, layout)
	if err != nil {
		return nil, err
	}
	if len(prims) == 0 {
		return nil, fmt.Errorf("writeGLB: %w: no non-empty primitives", domain.ErrBadSource)
	}

	doc.Meshes = []*gltf.Mesh{{Primitives: prims}}
	doc.Nodes = []*gltf.Node{{Mesh: new(0)}}
	doc.Scenes = []*gltf.Scene{{Nodes: []int{0}}}
	doc.Scene = new(0)

	return encodeGLB(doc)
}

// buildMaterial creates (or reuses) the glTF Material for one primitive. When
// hasUVs is false the texture is dropped even if present — UV-less primitives
// can't sample it correctly; baseColorFactor still works.
func buildMaterial(doc *gltf.Document, m glMaterial, hasUVs bool, samplerIdx int, cache map[string]int) (int, error) {
	pbr := &gltf.PBRMetallicRoughness{
		BaseColorFactor: &[4]float64{
			float64(m.BaseColor[0]),
			float64(m.BaseColor[1]),
			float64(m.BaseColor[2]),
			float64(m.BaseColor[3]),
		},
		RoughnessFactor: new(float64(1.0)),
		MetallicFactor:  new(float64(0.0)),
	}

	if m.Texture != nil && hasUVs {
		texIdx, err := embedTexture(doc, m.Texture, samplerIdx, cache)
		if err != nil {
			return 0, err
		}
		pbr.BaseColorTexture = &gltf.TextureInfo{Index: texIdx}
	}

	alphaMode := gltf.AlphaOpaque
	if m.BaseColor[3] < 1.0 {
		alphaMode = gltf.AlphaBlend
	}

	doc.Materials = append(doc.Materials, &gltf.Material{
		Name:                 m.Name,
		PBRMetallicRoughness: pbr,
		AlphaMode:            alphaMode,
		DoubleSided:          true,
	})
	return len(doc.Materials) - 1, nil
}

// embedTexture writes the image into the glTF buffer (once per unique path),
// registers the gltf.Texture, and returns the texture index. Subsequent calls
// with the same Path hit the cache.
func embedTexture(doc *gltf.Document, tex *textureAsset, samplerIdx int, cache map[string]int) (int, error) {
	if idx, ok := cache[tex.Path]; ok {
		return idx, nil
	}
	imgIdx, err := modeler.WriteImage(doc, tex.Path, tex.Mime, bytes.NewReader(tex.Data))
	if err != nil {
		return 0, fmt.Errorf("write image: %w", err)
	}
	doc.Textures = append(doc.Textures, &gltf.Texture{
		Source:  new(imgIdx),
		Sampler: new(samplerIdx),
	})
	textureIdx := len(doc.Textures) - 1
	cache[tex.Path] = textureIdx
	return textureIdx, nil
}
