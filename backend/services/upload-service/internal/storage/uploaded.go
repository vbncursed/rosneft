package storage

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// uploadedDir holds one empty marker file per (hash, owner) under the root:
// uploaded/<hash>/<owner>. The name is not a valid session id, so it can never
// collide with a session directory.
//
// ponytail: one tiny file per finalized upload, never pruned. Kept on the same
// volume as sessions because nothing else here is durable; move it to a table
// if the count ever matters.
const uploadedDir = "uploaded"

// RecordUpload remembers that owner finalized an upload whose bytes hash to
// hash. Recording the same pair twice is not an error.
func (f *FS) RecordUpload(_ context.Context, hash, owner string) error {
	file, err := f.uploadMarker(hash, owner)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		return fmt.Errorf("storage.RecordUpload: mkdir: %w", err)
	}
	if err := os.WriteFile(file, nil, 0o644); err != nil {
		return fmt.Errorf("storage.RecordUpload: write: %w", err)
	}
	return nil
}

// HasUpload reports whether owner ever finalized an upload with hash.
func (f *FS) HasUpload(_ context.Context, hash, owner string) (bool, error) {
	file, err := f.uploadMarker(hash, owner)
	if err != nil {
		return false, err
	}
	_, err = os.Stat(file)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return false, nil
	case err != nil:
		return false, fmt.Errorf("storage.HasUpload: stat: %w", err)
	}
	return true, nil
}

// uploadMarker validates both path segments — the hash comes from a request
// body — and returns the marker's path.
func (f *FS) uploadMarker(hash, owner string) (string, error) {
	for _, segment := range []string{hash, owner} {
		if err := validateID(segment); err != nil {
			return "", fmt.Errorf("%w: %w", domain.ErrInvalidInput, err)
		}
	}
	return filepath.Join(f.root, uploadedDir, hash, owner), nil
}
