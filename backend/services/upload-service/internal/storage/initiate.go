package storage

import (
	"context"
	"encoding/json/v2"
	"fmt"
	"os"
	"time"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// Initiate creates a new session directory under root and writes its meta.
// Returns the persisted session including the timestamps assigned by the
// store.
func (f *FS) Initiate(_ context.Context, id, owner string, size int64, contentType string) (domain.Session, error) {
	dir, _, meta, err := f.paths(id)
	if err != nil {
		return domain.Session{}, err
	}
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return domain.Session{}, fmt.Errorf("storage.Initiate: mkdir: %w", err)
	}
	now := time.Now().UTC()
	s := domain.Session{
		ID:          id,
		OwnerID:     owner,
		Size:        size,
		Offset:      0,
		ContentType: contentType,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := writeMeta(meta, s); err != nil {
		return domain.Session{}, err
	}
	return s, nil
}

func writeMeta(path string, s domain.Session) error {
	tmp := path + ".tmp"
	body, err := json.Marshal(s)
	if err != nil {
		return fmt.Errorf("storage.writeMeta: marshal: %w", err)
	}
	if err := writeSynced(tmp, body); err != nil {
		return fmt.Errorf("storage.writeMeta: write: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return fmt.Errorf("storage.writeMeta: rename: %w", err)
	}
	return nil
}

// writeSynced is os.WriteFile plus an fsync, so a rename that follows cannot
// publish a file whose contents are still only in the page cache.
func writeSynced(path string, body []byte) error {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600) //nolint:gosec // G304: path is derived from paths(), whose session id passed validateID (hex and dash only)
	if err != nil {
		return err
	}
	if _, err := f.Write(body); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		return err
	}
	return f.Close()
}
