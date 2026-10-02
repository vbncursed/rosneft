package service

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// Extraction limits against decompression bombs. The upload cap bounds only
// the compressed archive (2 GiB), and deflate expands ~1000x, so the extracted
// side needs its own cap. 8 GiB is four times the upload cap, ample for
// OBJ+textures, and fits the worker's work dir: no tmpfs is mounted, so it is
// the container layer on the 119 GB prod disk, not RAM (mesh-worker is 5g).
// The entry limit counts every entry, including the __MACOSX/AppleDouble ones
// that are skipped, so a Finder-made zip counts roughly double its real files.
const (
	maxExtractBytes   int64 = 8 << 30
	maxExtractEntries       = 10_000
)

// fetchAndExtract pulls the source ZIP blob and unpacks it into dir. Files
// are written under dir while preserving the archive's directory layout, so
// MTL relative-path references to textures continue to resolve.
func (m *Mesh) fetchAndExtract(ctx context.Context, hash, dir string) error {
	r, _, err := m.blobs.Get(ctx, hash)
	if err != nil {
		return fmt.Errorf("blob get: %w", err)
	}
	defer func() { _ = r.Close() }()

	body, err := io.ReadAll(r)
	if err != nil {
		return fmt.Errorf("blob read: %w", err)
	}
	zr, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		return fmt.Errorf("zip open: %w", err)
	}
	return extractZip(zr, dir, maxExtractBytes, maxExtractEntries)
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

// formatBytes renders n for the job error users see: whole GiB/MiB/KiB when n
// is an exact multiple, plain bytes otherwise.
func formatBytes(n int64) string {
	for _, u := range []struct {
		size int64
		name string
	}{{1 << 30, "GiB"}, {1 << 20, "MiB"}, {1 << 10, "KiB"}} {
		if n%u.size == 0 {
			return fmt.Sprintf("%d %s", n/u.size, u.name)
		}
	}
	return fmt.Sprintf("%d bytes", n)
}

// extractZip writes every file in zr under dir, rejecting entries whose path
// would escape via "..". A symlink entry is written as a regular file holding
// its target path and is never followed, so it cannot reach outside dir. The
// archive may hold at most maxEntries entries and expand to at most maxBytes in
// total, counted on the bytes actually copied (the header sizes are
// attacker-controlled); either limit fails the extraction with
// domain.ErrInvalidInput. Entries inside
// `__MACOSX/` and AppleDouble `._*` resource-fork files are skipped: macOS
// Finder bakes them into ZIPs and they share extensions with real assets,
// which used to make findFirstOBJ pick a 349-byte metadata blob and fail
// the conversion with "no non-empty primitives".
func extractZip(zr *zip.Reader, dir string, maxBytes int64, maxEntries int) error {
	if len(zr.File) > maxEntries {
		return fmt.Errorf("%w: archive has more than %d entries", domain.ErrInvalidInput, maxEntries)
	}
	remaining := maxBytes
	for _, f := range zr.File {
		if isAppleDoubleEntry(f.Name) {
			continue
		}
		if !filepath.IsLocal(f.Name) {
			return fmt.Errorf("zip entry escapes target: %q", f.Name)
		}
		dst := filepath.Join(dir, f.Name) //nolint:gosec // G305: f.Name passed filepath.IsLocal above
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(dst, 0o750); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(dst), 0o750); err != nil {
			return err
		}
		n, err := writeZipEntry(f, dst, remaining)
		if err != nil {
			if errors.Is(err, domain.ErrInvalidInput) {
				return fmt.Errorf("%w: archive expands past %s", domain.ErrInvalidInput, formatBytes(maxBytes))
			}
			return err
		}
		remaining -= n
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

// writeZipEntry copies f to dst and returns the bytes written. It reads at most
// limit bytes: one more means the entry overruns the budget, and the partial
// file is removed and domain.ErrInvalidInput returned.
func writeZipEntry(f *zip.File, dst string, limit int64) (int64, error) {
	rc, err := f.Open()
	if err != nil {
		return 0, err
	}
	defer func() { _ = rc.Close() }()

	w, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600) //nolint:gosec // G304: dst is dir joined with an entry name that passed the filepath.IsLocal check in extractZip
	if err != nil {
		return 0, err
	}
	n, err := io.Copy(w, io.LimitReader(rc, limit+1))
	if err == nil && n > limit {
		err = domain.ErrInvalidInput
	}
	if err != nil {
		_ = w.Close()
		_ = os.Remove(dst)
		return 0, err
	}
	// Close reports the final flush: a truncated texture or OBJ written here would
	// otherwise only surface much later as a corrupt conversion.
	return n, w.Close()
}
