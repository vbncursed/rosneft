package storage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
)

// Finalize streams the session's data through SHA-256 and copies it into
// BlobStore via the provided callback. Returns the content hash. The
// session directory is removed afterwards regardless of outcome — the
// BlobStore now owns the bytes (or, on error, nothing was published).
func (f *FS) Finalize(ctx context.Context, id string, putBlob func(ctx context.Context, hash string, r io.Reader) error) (string, int64, error) {
	dir, dataPath, _, err := f.paths(id)
	if err != nil {
		return "", 0, err
	}
	defer os.RemoveAll(dir)

	src, err := os.Open(dataPath)
	if err != nil {
		return "", 0, fmt.Errorf("storage.Finalize: open: %w", err)
	}
	defer src.Close()

	stat, err := src.Stat()
	if err != nil {
		return "", 0, fmt.Errorf("storage.Finalize: stat: %w", err)
	}

	hash, err := hashFile(dataPath)
	if err != nil {
		return "", 0, err
	}

	// Re-open for the put pass so the reader is at offset 0.
	body, err := os.Open(dataPath)
	if err != nil {
		return "", 0, fmt.Errorf("storage.Finalize: reopen: %w", err)
	}
	defer body.Close()

	if err := putBlob(ctx, hash, body); err != nil {
		return "", 0, fmt.Errorf("storage.Finalize: put blob: %w", err)
	}
	return hash, stat.Size(), nil
}

// Abort removes the session directory without publishing anything.
func (f *FS) Abort(_ context.Context, id string) error {
	dir, _, _, err := f.paths(id)
	if err != nil {
		return err
	}
	return os.RemoveAll(dir)
}

func hashFile(path string) (string, error) {
	src, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("storage.hashFile: open: %w", err)
	}
	defer src.Close()
	h := sha256.New()
	if _, err := io.Copy(h, src); err != nil {
		return "", fmt.Errorf("storage.hashFile: copy: %w", err)
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
