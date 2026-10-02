package converter

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// Convert reads sourcePath (an OBJ file, inside root) plus its sibling MTL and any textures
// the MTL references, normalizes the geometry (Z-up→Y-up, center, scale to
// maxDim=2), and emits a binary glTF (.glb).
//
// Materials are derived from the MTL: each `usemtl` group becomes a separate
// glTF primitive carrying baseColorFactor (from `Kd` + `d`/`Tr`) and, when the
// material has a `map_Kd` pointing at a JPEG/PNG file, baseColorTexture. Bad
// material refs are tolerated — a missing MTL or unreadable texture is logged
// and the primitive falls back to a flat-coloured default — so a single bad
// asset cannot fail the whole job.
//
// root is the directory holding the whole extracted upload. An MTL or texture
// reference may point anywhere inside it ("../textures/x.jpg" from
// "model/m.obj") but never outside.
func (c *Converter) Convert(ctx context.Context, root, sourcePath string) (domain.ConversionResult, error) {
	raw, err := c.convertRaw(ctx, root, sourcePath)
	if err != nil {
		return domain.ConversionResult{}, err
	}
	return c.finish(ctx, raw)
}

// finish applies the optional gltfpack pass to a raw GLB and packages the
// bytes as a catalog-ready artifact. Split out of Convert so ConvertLODs can
// produce LOD0 from the same raw bytes it then simplifies.
func (c *Converter) finish(ctx context.Context, raw rawGLB) (domain.ConversionResult, error) {
	report(ctx, "compressing", 0.55)
	body, err := c.compress(ctx, raw.content)
	if err != nil {
		return domain.ConversionResult{}, err
	}
	sum := sha256.Sum256(body)
	return domain.ConversionResult{
		ArtifactHash: hex.EncodeToString(sum[:]),
		Content:      body,
		ContentType:  "model/gltf-binary",
		Size:         int64(len(body)),
		Vertices:     raw.vertices,
		Faces:        raw.faces,
		BBoxMin:      raw.bboxMin,
		BBoxMax:      raw.bboxMax,
	}, nil
}

// buildGLMaterials produces one glMaterial per src.group, in order. Resolution
// pipeline:
//  1. Find the MTL: src.mtllib (relative to OBJ dir), or "<obj>.mtl" fallback.
//  2. Parse MTL into a name→material lookup.
//  3. For each group, look up the named material — when missing, default to
//     opaque white. When map_Kd points at a readable JPEG/PNG, attach it.
//
// All warnings are logged via slog; this function never returns an error so
// the conversion can always produce a sensible artifact.
func buildGLMaterials(ctx context.Context, src parsedSource, rootDir, sourcePath string) []glMaterial {
	// Every path below is relative to the root, so nothing the MTL says can
	// name a file outside the extraction.
	objRel, err := filepath.Rel(rootDir, filepath.Dir(sourcePath))
	if err != nil || !filepath.IsLocal(objRel) {
		slog.WarnContext(ctx, "converter: OBJ is outside the source root, materials default to white",
			slog.String("root", rootDir), slog.String("obj", sourcePath))
		return defaultMaterials(src)
	}
	root, err := os.OpenRoot(rootDir)
	if err != nil {
		slog.WarnContext(ctx, "converter: cannot open source root, materials default to white",
			slog.String("root", rootDir), slog.Any("error", err))
		return defaultMaterials(src)
	}
	defer func() { _ = root.Close() }()
	mtlByName := loadMTL(ctx, root, objRel, src.mtllib, sourcePath)

	textureCache := map[string]*textureAsset{}

	out := make([]glMaterial, 0, len(src.groups))
	for _, g := range src.groups {
		m, ok := mtlByName[g.name]
		if !ok {
			if g.name != "" {
				slog.WarnContext(ctx, "converter: material not found in MTL, using default",
					slog.String("material", g.name))
			}
			out = append(out, glMaterial{
				Name:      g.name,
				BaseColor: [4]float32{1, 1, 1, 1},
			})
			continue
		}
		gm := glMaterial{
			Name:      m.name,
			BaseColor: [4]float32{m.kd[0], m.kd[1], m.kd[2], m.alpha},
		}
		if m.diffuseMap != "" {
			tex := loadTexture(ctx, root, objRel, m.diffuseMap, textureCache)
			if tex != nil {
				gm.Texture = tex
			}
		}
		out = append(out, gm)
	}
	return out
}

func defaultMaterials(src parsedSource) []glMaterial {
	out := make([]glMaterial, len(src.groups))
	for i, g := range src.groups {
		out[i] = glMaterial{Name: g.name, BaseColor: [4]float32{1, 1, 1, 1}}
	}
	return out
}
