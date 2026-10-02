package converter

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
)

// loadMTL reads and parses the MTL referenced by `mtllib` (relative to the OBJ
// directory). When mtllib is empty the function falls back to "<obj-base>.mtl"
// — the de-facto convention when mtllib is omitted by hand-written OBJs.
//
// root confines every read: mtllib is text from the uploaded OBJ, and a path
// that leaves the root (or follows a symlink out of it) is refused and logged.
//
// Returns an empty map (never nil) on any error so the caller can iterate
// safely without nil checks.
func loadMTL(ctx context.Context, root *os.Root, objRel, mtllib, sourcePath string) map[string]material {
	candidates := make([]string, 0, 2)
	if mtllib != "" {
		candidates = append(candidates, filepath.Join(objRel, mtllib))
	}
	base := strings.TrimSuffix(filepath.Base(sourcePath), filepath.Ext(sourcePath))
	candidates = append(candidates, filepath.Join(objRel, base+".mtl"))

	for _, path := range candidates {
		f, err := root.Open(path)
		if err != nil {
			if !errors.Is(err, os.ErrNotExist) {
				slog.WarnContext(ctx, "converter: skipping MTL: not readable inside the upload",
					slog.String("path", path), slog.Any("error", err))
			}
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

// loadTexture reads a single texture through root, resolves the MIME type from
// the extension, and caches the result so the same file isn't re-read for
// each material that references it. Returns nil when the file is missing,
// outside root or unsupported (caller falls back to baseColorFactor only).
func loadTexture(ctx context.Context, root *os.Root, objRel, relPath string, cache map[string]*textureAsset) *textureAsset {
	if t, ok := cache[relPath]; ok {
		return t
	}
	full := filepath.Join(objRel, relPath)
	mime, err := mimeFromPath(full)
	if err != nil {
		slog.WarnContext(ctx, "converter: skipping texture: unsupported format",
			slog.String("path", full), slog.Any("error", err))
		cache[relPath] = nil
		return nil
	}
	data, err := root.ReadFile(full)
	if err != nil {
		slog.WarnContext(ctx, "converter: skipping texture: not readable inside the upload",
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
