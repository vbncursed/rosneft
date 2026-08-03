package converter

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// Convert reads sourcePath (an OBJ file) plus its sibling MTL and any textures
// the MTL references, normalizes the geometry (Z-up→Y-up, center, scale to
// maxDim=2), and emits a binary glTF (.glb).
//
// Materials are derived from the MTL: each `usemtl` group becomes a separate
// glTF primitive carrying baseColorFactor (from `Kd` + `d`/`Tr`) and, when the
// material has a `map_Kd` pointing at a JPEG/PNG file, baseColorTexture. Bad
// material refs are tolerated — a missing MTL or unreadable texture is logged
// and the primitive falls back to a flat-coloured default — so a single bad
// asset cannot fail the whole job.
func (c *Converter) Convert(ctx context.Context, sourcePath string) (domain.ConversionResult, error) {
	raw, err := c.convertRaw(ctx, sourcePath)
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
func buildGLMaterials(ctx context.Context, src parsedSource, sourcePath string) []glMaterial {
	objDir := filepath.Dir(sourcePath)
	mtlByName := loadMTL(ctx, objDir, src.mtllib, sourcePath)

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
			tex := loadTexture(ctx, objDir, m.diffuseMap, textureCache)
			if tex != nil {
				gm.Texture = tex
			}
		}
		out = append(out, gm)
	}
	return out
}

// loadMTL reads and parses the MTL referenced by `mtllib` (relative to the OBJ
// directory). When mtllib is empty the function falls back to "<obj-base>.mtl"
// — the de-facto convention when mtllib is omitted by hand-written OBJs.
//
// Returns an empty map (never nil) on any error so the caller can iterate
// safely without nil checks.
func loadMTL(ctx context.Context, objDir, mtllib, sourcePath string) map[string]material {
	candidates := make([]string, 0, 2)
	if mtllib != "" {
		candidates = append(candidates, filepath.Join(objDir, mtllib))
	}
	base := strings.TrimSuffix(filepath.Base(sourcePath), filepath.Ext(sourcePath))
	candidates = append(candidates, filepath.Join(objDir, base+".mtl"))

	for _, path := range candidates {
		f, err := os.Open(path)
		if err != nil {
			continue
		}
		mats, err := parseMTL(f)
		_ = f.Close()
		if err != nil {
			slog.WarnContext(ctx, "converter: MTL parse failed",
				slog.String("path", path), slog.Any("error", err))
			return map[string]material{}
		}
		out := make(map[string]material, len(mats))
		for _, m := range mats {
			out[m.name] = m
		}
		return out
	}
	slog.WarnContext(ctx, "converter: MTL not found, materials default to white",
		slog.String("obj", sourcePath), slog.String("mtllib", mtllib))
	return map[string]material{}
}

// loadTexture reads a single texture from disk, resolves the MIME type from
// the extension, and caches the result so the same file isn't re-read for
// each material that references it. Returns nil when the file is missing or
// unsupported (caller falls back to baseColorFactor only).
func loadTexture(ctx context.Context, objDir, relPath string, cache map[string]*textureAsset) *textureAsset {
	if t, ok := cache[relPath]; ok {
		return t
	}
	full := filepath.Join(objDir, relPath)
	mime, err := mimeFromPath(full)
	if err != nil {
		slog.WarnContext(ctx, "converter: skipping texture: unsupported format",
			slog.String("path", full), slog.Any("error", err))
		cache[relPath] = nil
		return nil
	}
	data, err := os.ReadFile(full)
	if err != nil {
		slog.WarnContext(ctx, "converter: skipping texture: read failed",
			slog.String("path", full), slog.Any("error", err))
		cache[relPath] = nil
		return nil
	}
	t := &textureAsset{
		Path: relPath,
		Mime: mime,
		Data: data,
	}
	cache[relPath] = t
	return t
}

// mimeFromPath returns the IANA media type for a glTF-supported texture
// extension. glTF 2.0 only mandates JPEG and PNG; anything else is rejected.
func mimeFromPath(path string) (string, error) {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".jpg", ".jpeg":
		return "image/jpeg", nil
	case ".png":
		return "image/png", nil
	default:
		return "", errors.New("only .jpg, .jpeg, .png are supported by glTF")
	}
}
