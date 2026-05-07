package converter

import (
	"bytes"
	"fmt"

	"github.com/qmuntal/gltf"
	"github.com/qmuntal/gltf/modeler"
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

	posArr := make([][3]float32, len(positions))
	for i, p := range positions {
		posArr[i] = [3]float32(p)
	}
	posIdx := modeler.WritePosition(doc, posArr)

	var uvIdx int
	hasUVs := uvs != nil
	if hasUVs {
		uvArr := make([][2]float32, len(uvs))
		for i, t := range uvs {
			uvArr[i] = [2]float32(t)
		}
		uvIdx = modeler.WriteTextureCoord(doc, uvArr)
	}

	// One glTF Sampler shared by every textured primitive.
	var samplerIdx int
	doc.Samplers = append(doc.Samplers, &gltf.Sampler{
		MagFilter: gltf.MagLinear,
		MinFilter: gltf.MinLinearMipMapLinear,
		WrapS:     gltf.WrapRepeat,
		WrapT:     gltf.WrapRepeat,
	})
	samplerIdx = len(doc.Samplers) - 1

	// Cache keyed by texture path so the same image is embedded once.
	textureIndexByPath := map[string]int{}

	prims := make([]*gltf.Primitive, 0, len(groups))
	for i, g := range groups {
		if len(g.triangles) == 0 {
			continue
		}
		indices := make([]uint32, 0, len(g.triangles)*3)
		for _, t := range g.triangles {
			indices = append(indices, t[0], t[1], t[2])
		}
		idx := modeler.WriteIndices(doc, indices)

		attrs := gltf.PrimitiveAttributes{gltf.POSITION: posIdx}
		if hasUVs {
			attrs[gltf.TEXCOORD_0] = uvIdx
		}

		matIdx, err := buildMaterial(doc, materials[i], hasUVs, samplerIdx, textureIndexByPath)
		if err != nil {
			return nil, fmt.Errorf("writeGLB: material %q: %w", materials[i].Name, err)
		}

		prims = append(prims, &gltf.Primitive{
			Attributes: attrs,
			Indices:    gltf.Index(idx),
			Material:   gltf.Index(matIdx),
		})
	}

	if len(prims) == 0 {
		return nil, fmt.Errorf("writeGLB: no non-empty primitives")
	}

	doc.Meshes = []*gltf.Mesh{{Primitives: prims}}
	doc.Nodes = []*gltf.Node{{Mesh: gltf.Index(0)}}
	doc.Scenes = []*gltf.Scene{{Nodes: []int{0}}}
	doc.Scene = gltf.Index(0)

	var buf bytes.Buffer
	enc := gltf.NewEncoder(&buf)
	enc.AsBinary = true
	if err := enc.Encode(doc); err != nil {
		return nil, fmt.Errorf("writeGLB: encode: %w", err)
	}
	return buf.Bytes(), nil
}

// buildMaterial creates (or reuses) the glTF Material for one primitive. When
// hasUVs is false the texture is dropped even if present — UV-less primitives
// can't sample it correctly; baseColorFactor still works.
func buildMaterial(doc *gltf.Document, m glMaterial, hasUVs bool, samplerIdx int, cache map[string]int) (int, error) {
	roughness := float64(1.0)
	metallic := float64(0.0)

	pbr := &gltf.PBRMetallicRoughness{
		BaseColorFactor: &[4]float64{
			float64(m.BaseColor[0]),
			float64(m.BaseColor[1]),
			float64(m.BaseColor[2]),
			float64(m.BaseColor[3]),
		},
		RoughnessFactor: &roughness,
		MetallicFactor:  &metallic,
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
		Source:  gltf.Index(imgIdx),
		Sampler: gltf.Index(samplerIdx),
	})
	textureIdx := len(doc.Textures) - 1
	cache[tex.Path] = textureIdx
	return textureIdx, nil
}
