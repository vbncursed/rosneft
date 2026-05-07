package service

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// fetchAndExtract pulls the source ZIP blob and unpacks it into dir. Files
// are written under dir while preserving the archive's directory layout, so
// MTL relative-path references to textures continue to resolve.
func (m *Mesh) fetchAndExtract(ctx context.Context, hash, dir string) error {
	r, _, err := m.blobs.Get(ctx, hash)
	if err != nil {
		return fmt.Errorf("blob get: %w", err)
	}
	defer r.Close()

	body, err := io.ReadAll(r)
	if err != nil {
		return fmt.Errorf("blob read: %w", err)
	}
	zr, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		return fmt.Errorf("zip open: %w", err)
	}
	return extractZip(zr, dir)
}

// findFirstOBJ walks dir recursively and returns the path to the first .obj
// it finds (sorted alphabetically by directory walk for determinism).
func findFirstOBJ(dir string) (string, error) {
	var found string
	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || found != "" {
			return nil
		}
		if strings.EqualFold(filepath.Ext(path), ".obj") {
			found = path
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if found == "" {
		return "", fmt.Errorf("%w: no .obj in source archive", domain.ErrInvalidInput)
	}
	return found, nil
}

// extractZip writes every file in zr under dir, rejecting entries whose path
// would escape via "..". Symlinks are skipped; we only support regular files
// and directories — the source bundles never have symlinks. Entries inside
// `__MACOSX/` and AppleDouble `._*` resource-fork files are skipped: macOS
// Finder bakes them into ZIPs and they share extensions with real assets,
// which used to make findFirstOBJ pick a 349-byte metadata blob and fail
// the conversion with "no non-empty primitives".
func extractZip(zr *zip.Reader, dir string) error {
	for _, f := range zr.File {
		if isAppleDoubleEntry(f.Name) {
			continue
		}
		clean := filepath.Clean(f.Name)
		if strings.HasPrefix(clean, "..") || filepath.IsAbs(clean) {
			return fmt.Errorf("zip entry escapes target: %q", f.Name)
		}
		dst := filepath.Join(dir, clean)
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(dst, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			return err
		}
		if err := writeZipEntry(f, dst); err != nil {
			return err
		}
	}
	return nil
}

// isAppleDoubleEntry returns true for ZIP paths the macOS Finder
// generates as a side-effect of "Compress" — the __MACOSX prefix tree
// and AppleDouble `._<name>` files in any directory.
func isAppleDoubleEntry(name string) bool {
	if strings.HasPrefix(name, "__MACOSX/") || strings.HasPrefix(name, "__MACOSX\\") {
		return true
	}
	base := filepath.Base(name)
	return strings.HasPrefix(base, "._")
}

func writeZipEntry(f *zip.File, dst string) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()

	w, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	defer w.Close()

	if _, err := io.Copy(w, rc); err != nil {
		return err
	}
	return nil
}
