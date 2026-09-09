package converter

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// ConvertLODs produces LOD0 (full quality) plus one additional LOD artifact
// per configured ratio. The slice is ordered LOD0 → LODN; index in the slice
// IS the LOD level the catalog should record. When no ratios are configured
// or no simplifier is wired, returns just LOD0.
//
// Every LOD — including LOD0 — is derived from the same uncompressed GLB,
// never from LOD0's compressed bytes: gltfpack cannot decode Basis Universal
// textures, so simplifying the compressed artifact would leave every LOD
// carrying full-resolution textures.
//
// Every LOD carries its own vertex/face counts, read back from its own
// produced GLB, and LOD 0's source-unit bounding box (simplification never
// moves the mesh, so every LOD shares it).
func (c *Converter) ConvertLODs(ctx context.Context, sourcePath string) ([]domain.ConversionResult, error) {
	raw, err := c.convertRaw(ctx, sourcePath)
	if err != nil {
		return nil, err
	}
	base, err := c.finish(ctx, raw)
	if err != nil {
		return nil, err
	}
	out := []domain.ConversionResult{base}
	if c.compressor == nil || len(c.lodRatios) == 0 {
		return out, nil
	}

	// Per-LOD progress span: each ratio bumps the bar evenly between the
	// post-encode 0.65 and the 0.95 ceiling left for the worker's register
	// pass. Reporting fires before each gltfpack invocation so the user
	// sees movement even if a single LOD takes 30s+ to simplify.
	const lodStart, lodSpan = float32(0.65), float32(0.30)
	per := lodSpan / float32(len(c.lodRatios))
	for i, ratio := range c.lodRatios {
		report(ctx, fmt.Sprintf("lod-%d", i+1), lodStart+per*float32(i))
		lod, err := c.simplifyLOD(ctx, raw, ratio)
		if err != nil {
			// Per-LOD failures shouldn't fail the whole job — LOD0 is still
			// usable. Log and move on so the worker can register what it has.
			slog.WarnContext(ctx, "converter: LOD generation failed",
				slog.Int("lod", i+1),
				slog.Float64("ratio", ratio),
				slog.Any("error", err))
			continue
		}
		out = append(out, lod)
	}
	return out, nil
}

// simplifyLOD runs one simplification pass and packages the result with a
// fresh content hash. Vertex and face counts are read back from the produced
// GLB's glTF header; the bounding box is copied from the raw conversion,
// because simplification never moves the mesh and the box LOD0 records is in
// source units, not the normalized ones the GLB itself carries.
//
// Unreadable bytes leave the counts at zero rather than failing the LOD: the
// artifact is complete, only its statistics are missing.
func (c *Converter) simplifyLOD(ctx context.Context, raw rawGLB, ratio float64) (domain.ConversionResult, error) {
	body, err := c.compressor.Simplify(ctx, raw.content, ratio)
	if err != nil {
		return domain.ConversionResult{}, fmt.Errorf("simplify ratio=%v: %w", ratio, err)
	}
	vertices, faces, err := glbStats(body)
	if err != nil {
		slog.WarnContext(ctx, "converter: LOD stats unavailable",
			slog.Float64("ratio", ratio), slog.Any("error", err))
	}
	sum := sha256.Sum256(body)
	return domain.ConversionResult{
		ArtifactHash: hex.EncodeToString(sum[:]),
		Content:      body,
		ContentType:  "model/gltf-binary",
		Size:         int64(len(body)),
		Vertices:     vertices,
		Faces:        faces,
		BBoxMin:      raw.bboxMin,
		BBoxMax:      raw.bboxMax,
	}, nil
}
