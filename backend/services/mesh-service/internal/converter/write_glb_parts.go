package converter

import (
	"bytes"
	"fmt"

	"github.com/qmuntal/gltf"
	"github.com/qmuntal/gltf/modeler"
)

// vertexLayout is where writeVertexData and addSampler put the buffers every
// primitive shares.
type vertexLayout struct {
	position int
	uv       int
	hasUVs   bool
	sampler  int
}

// writeVertexData writes the shared position buffer and, when uvs is non-nil,
// the UV buffer, in that order, and returns their accessor indices.
func writeVertexData(doc *gltf.Document, positions []vertex, uvs []uv) (posIdx, uvIdx int, hasUVs bool) {
	posArr := make([][3]float32, len(positions))
	for i, p := range positions {
		posArr[i] = [3]float32(p)
	}
	posIdx = modeler.WritePosition(doc, posArr)

	hasUVs = uvs != nil
	if hasUVs {
		uvArr := make([][2]float32, len(uvs))
		for i, t := range uvs {
			uvArr[i] = [2]float32(t)
		}
		uvIdx = modeler.WriteTextureCoord(doc, uvArr)
	}
	return posIdx, uvIdx, hasUVs
}

// addSampler adds the one glTF Sampler shared by every textured primitive.
func addSampler(doc *gltf.Document) int {
	doc.Samplers = append(doc.Samplers, &gltf.Sampler{
		MagFilter: gltf.MagLinear,
		MinFilter: gltf.MinLinearMipMapLinear,
		WrapS:     gltf.WrapRepeat,
		WrapT:     gltf.WrapRepeat,
	})
	return len(doc.Samplers) - 1
}

// buildPrimitives writes one primitive per non-empty group: its index buffer,
// then its material (which embeds the texture on first use).
func buildPrimitives(
	doc *gltf.Document,
	groups []materialGroup,
	materials []glMaterial,
	layout vertexLayout,
) ([]*gltf.Primitive, error) {
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

		attrs := gltf.PrimitiveAttributes{gltf.POSITION: layout.position}
		if layout.hasUVs {
			attrs[gltf.TEXCOORD_0] = layout.uv
		}

		matIdx, err := buildMaterial(doc, materials[i], layout.hasUVs, layout.sampler, textureIndexByPath)
		if err != nil {
			return nil, fmt.Errorf("writeGLB: material %q: %w", materials[i].Name, err)
		}

		prims = append(prims, &gltf.Primitive{
			Attributes: attrs,
			Indices:    new(idx),
			Material:   new(matIdx),
		})
	}
	return prims, nil
}

// encodeGLB serialises doc as a binary glTF.
func encodeGLB(doc *gltf.Document) ([]byte, error) {
	var buf bytes.Buffer
	enc := gltf.NewEncoder(&buf)
	enc.AsBinary = true
	if err := enc.Encode(doc); err != nil {
		return nil, fmt.Errorf("writeGLB: encode: %w", err)
	}
	return buf.Bytes(), nil
}
