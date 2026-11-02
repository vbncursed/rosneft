package storage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// Finalize streams the session's data through SHA-256 and copies it into
// BlobStore via the provided callback. Returns the content hash. The session
// directory is removed once the BlobStore owns the bytes, or when the session
// can never succeed (ErrInvalidInput: wrong size, rejected content). Any other
// failure — a blob store outage, an I/O error — keeps it so the client can
// retry the finalize instead of re-uploading the whole file.
func (f *FS) Finalize(
	ctx context.Context,
	id string,
	putBlob func(ctx context.Context, hash string, r io.Reader) error,
) (_ string, _ int64, err error) {
	dir, dataPath, metaPath, err := f.paths(id)
	if err != nil {
		return "", 0, err
	}
	defer f.lock(id)()
	defer func() {
		if sessionSettled(err) {
			_ = os.RemoveAll(dir)
		}
	}()

	meta, err := readMeta(metaPath)
	if err != nil {
		return "", 0, err
	}
	size, err := checkSizes(dataPath, meta)
	if err != nil {
		return "", 0, err
	}

	hash, err := hashFile(dataPath)
	if err != nil {
		return "", 0, err
	}
	if err := putFile(ctx, dataPath, hash, putBlob); err != nil {
		return "", 0, err
	}
	return hash, size, nil
}

// sessionSettled reports whether the session directory may go: the blob was
// published, or the session can never succeed. Anything else keeps it.
func sessionSettled(err error) bool {
	return err == nil || errors.Is(err, domain.ErrInvalidInput)
}

// checkSizes returns the size of the data file once it agrees with the session.
// The recorded offset is what the client was told; the file is what would be
// published. They must agree with the declared size or the blob is wrong.
func checkSizes(dataPath string, meta domain.Session) (int64, error) {
	src, err := os.Open( //nolint:gosec // G304: dataPath comes from paths(), whose session id passed validateID (hex and dash only)
		dataPath,
	)
	if err != nil {
		return 0, fmt.Errorf("storage.Finalize: open: %w", err)
	}
	defer func() { _ = src.Close() }()

	stat, err := src.Stat()
	if err != nil {
		return 0, fmt.Errorf("storage.Finalize: stat: %w", err)
	}
	if meta.Offset != meta.Size || stat.Size() != meta.Size {
		return 0, fmt.Errorf(
			"%w: declared %d, recorded %d, on disk %d",
			domain.ErrInvalidInput,
			meta.Size,
			meta.Offset,
			stat.Size(),
		)
	}
	return stat.Size(), nil
}

// putFile opens the data file afresh, so the reader is at offset 0, and hands
// it to putBlob.
func putFile(
	ctx context.Context,
	dataPath, hash string,
	putBlob func(ctx context.Context, hash string, r io.Reader) error,
) error {
	body, err := os.Open( //nolint:gosec // G304: dataPath comes from paths(), whose session id passed validateID (hex and dash only)
		dataPath,
	)
	if err != nil {
		return fmt.Errorf("storage.Finalize: reopen: %w", err)
	}
	defer func() { _ = body.Close() }()

	if err := putBlob(ctx, hash, body); err != nil {
		return fmt.Errorf("storage.Finalize: put blob: %w", err)
	}
	return nil
}

// Abort removes the session directory without publishing anything. It takes the
// session lock, so it waits for a running Finalize or AppendChunk instead of
// unlinking files under them.
func (f *FS) Abort(_ context.Context, id string) error {
	dir, _, _, err := f.paths(id)
	if err != nil {
		return err
	}
	defer f.lock(id)()
	return os.RemoveAll(dir)
}

func hashFile(path string) (string, error) {
	src, err := os.Open( //nolint:gosec // G304: path is dataPath from paths(), whose session id passed validateID (hex and dash only)
		path,
	)
	if err != nil {
		return "", fmt.Errorf("storage.hashFile: open: %w", err)
	}
	defer func() { _ = src.Close() }()
	h := sha256.New()
	if _, err := io.Copy(h, src); err != nil {
		return "", fmt.Errorf("storage.hashFile: copy: %w", err)
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
