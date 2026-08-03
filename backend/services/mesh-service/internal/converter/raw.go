package converter

import (
	"context"
	"fmt"
	"os"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// rawGLB is the converter's output before any gltfpack pass: plain glTF with
// uncompressed geometry and the source's own JPEG/PNG textures still embedded.
//
// Keeping this separate from ConversionResult is what lets ConvertLODs hand
// gltfpack an input it can actually re-encode. Feeding it the compressed LOD0
// instead means the textures arrive as Basis Universal, which gltfpack cannot
// decode — so `-ts` would silently do nothing and every LOD would ship
// full-resolution textures.
type rawGLB struct {
	content  []byte
	vertices uint64
	faces    uint64
	bboxMin  domain.Vec3
	bboxMax  domain.Vec3
}

// convertRaw runs the pure conversion pipeline: parse OBJ, normalize
// (Z-up→Y-up, center, scale to maxDim=2), resolve materials, emit GLB. No
// external binary is involved, so the result is deterministic.
func (c *Converter) convertRaw(ctx context.Context, sourcePath string) (rawGLB, error) {
	if err := ctx.Err(); err != nil {
		return rawGLB{}, err
	}
	f, err := os.Open(sourcePath)
	if err != nil {
		return rawGLB{}, fmt.Errorf("converter: open %q: %w", sourcePath, err)
	}
	defer func() { _ = f.Close() }()

	report(ctx, "parsing", 0.30)
	src, err := parseOBJ(f)
	if err != nil {
		return rawGLB{}, fmt.Errorf("converter: parse: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return rawGLB{}, err
	}

	report(ctx, "encoding", 0.45)
	origMin, origMax := normalize(src.positions)

	materials := buildGLMaterials(ctx, src, sourcePath)

	body, err := writeGLB(src.positions, src.uvs, src.groups, materials)
	if err != nil {
		return rawGLB{}, fmt.Errorf("converter: write: %w", err)
	}

	totalTris := uint64(0)
	for _, g := range src.groups {
		totalTris += uint64(len(g.triangles))
	}
	return rawGLB{
		content:  body,
		vertices: uint64(len(src.positions)),
		faces:    totalTris,
		bboxMin:  domain.Vec3{X: float64(origMin[0]), Y: float64(origMin[1]), Z: float64(origMin[2])},
		bboxMax:  domain.Vec3{X: float64(origMax[0]), Y: float64(origMax[1]), Z: float64(origMax[2])},
	}, nil
}
