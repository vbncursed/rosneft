package blobstore

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// FS is a filesystem-backed Store. Blobs are sharded by the first two hex
// characters of their hash (256 buckets) to avoid huge directory listings.
//
// Layout:
//
//	<root>/<shard>/<hash>.bin   // content
//	<root>/<shard>/<hash>.json  // metadata (Blob)
//
// Writes are atomic: content is staged at <hash>.bin.tmp then renamed.
type FS struct {
	root string
}

// Compile-time interface check.
var _ Store = (*FS)(nil)

// NewFS creates the root directory if it does not exist and returns a Store.
func NewFS(root string) (*FS, error) {
	if root == "" {
		return nil, errors.New("blobstore: empty root")
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, fmt.Errorf("blobstore.NewFS: %w", err)
	}
	return &FS{root: root}, nil
}

// validateHash rejects empty, too-short, and non-hex hashes. Returning an
// error here prevents path-traversal via crafted hash strings.
func validateHash(hash string) error {
	if len(hash) < 2 {
		return fmt.Errorf("blobstore: hash too short: %q", hash)
	}
	for _, c := range hash {
		switch {
		case c >= '0' && c <= '9':
		case c >= 'a' && c <= 'f':
		case c >= 'A' && c <= 'F':
		default:
			return fmt.Errorf("blobstore: hash contains non-hex character: %q", hash)
		}
	}
	return nil
}

func (f *FS) paths(hash string) (data, meta string, err error) {
	if err := validateHash(hash); err != nil {
		return "", "", err
	}
	shard := hash[:2]
	base := filepath.Join(f.root, shard, hash)
	return base + ".bin", base + ".json", nil
}

// Put writes content from r atomically and stores its metadata.
func (f *FS) Put(ctx context.Context, hash, contentType string, r io.Reader) (Blob, error) {
	if err := ctx.Err(); err != nil {
		return Blob{}, err
	}
	data, meta, err := f.paths(hash)
	if err != nil {
		return Blob{}, err
	}
	if err := os.MkdirAll(filepath.Dir(data), 0o755); err != nil {
		return Blob{}, fmt.Errorf("blobstore: mkdir: %w", err)
	}

	tmp := data + ".tmp"
	out, err := os.Create(tmp)
	if err != nil {
		return Blob{}, fmt.Errorf("blobstore: create tmp: %w", err)
	}

	n, copyErr := io.Copy(out, r)
	closeErr := out.Close()
	if copyErr != nil {
		_ = os.Remove(tmp)
		return Blob{}, fmt.Errorf("blobstore: copy: %w", copyErr)
	}
	if closeErr != nil {
		_ = os.Remove(tmp)
		return Blob{}, fmt.Errorf("blobstore: close tmp: %w", closeErr)
	}

	if err := os.Rename(tmp, data); err != nil {
		_ = os.Remove(tmp)
		return Blob{}, fmt.Errorf("blobstore: rename: %w", err)
	}

	blob := Blob{Hash: hash, ContentType: contentType, Size: n}
	metaBytes, err := json.Marshal(blob)
	if err != nil {
		return blob, fmt.Errorf("blobstore: marshal meta: %w", err)
	}
	if err := os.WriteFile(meta, metaBytes, 0o644); err != nil {
		return blob, fmt.Errorf("blobstore: write meta: %w", err)
	}
	return blob, nil
}

// Get returns a reader for the blob's content. Caller MUST close it.
func (f *FS) Get(ctx context.Context, hash string) (io.ReadCloser, Blob, error) {
	blob, err := f.Stat(ctx, hash)
	if err != nil {
		return nil, Blob{}, err
	}
	data, _, _ := f.paths(hash)
	rc, err := os.Open(data)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, Blob{}, ErrNotFound
		}
		return nil, Blob{}, fmt.Errorf("blobstore: open data: %w", err)
	}
	return rc, blob, nil
}

// Stat returns metadata only.
func (f *FS) Stat(ctx context.Context, hash string) (Blob, error) {
	if err := ctx.Err(); err != nil {
		return Blob{}, err
	}
	_, meta, err := f.paths(hash)
	if err != nil {
		return Blob{}, err
	}
	b, err := os.ReadFile(meta)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Blob{}, ErrNotFound
		}
		return Blob{}, fmt.Errorf("blobstore: read meta: %w", err)
	}
	var blob Blob
	if err := json.Unmarshal(b, &blob); err != nil {
		return Blob{}, fmt.Errorf("blobstore: unmarshal meta: %w", err)
	}
	return blob, nil
}

// Exists checks whether a blob with the given hash exists.
func (f *FS) Exists(ctx context.Context, hash string) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	_, meta, err := f.paths(hash)
	if err != nil {
		return false, err
	}
	if _, err := os.Stat(meta); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, nil
		}
		return false, fmt.Errorf("blobstore: stat: %w", err)
	}
	return true, nil
}

// Delete removes both data and metadata. Missing files are not an error.
func (f *FS) Delete(ctx context.Context, hash string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	data, meta, err := f.paths(hash)
	if err != nil {
		return err
	}
	dataErr := os.Remove(data)
	if errors.Is(dataErr, os.ErrNotExist) {
		dataErr = nil
	}
	metaErr := os.Remove(meta)
	if errors.Is(metaErr, os.ErrNotExist) {
		metaErr = nil
	}
	return errors.Join(dataErr, metaErr)
}
