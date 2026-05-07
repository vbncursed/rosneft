package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// Initiate creates a new session directory under root and writes its meta.
// Returns the persisted session including the timestamps assigned by the
// store.
func (f *FS) Initiate(_ context.Context, id string, size int64, contentType string) (domain.Session, error) {
	dir, _, meta, err := f.paths(id)
	if err != nil {
		return domain.Session{}, err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return domain.Session{}, fmt.Errorf("storage.Initiate: mkdir: %w", err)
	}
	now := time.Now().UTC()
	s := domain.Session{
		ID:          id,
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
	if err := os.WriteFile(tmp, body, 0o644); err != nil {
		return fmt.Errorf("storage.writeMeta: write: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return fmt.Errorf("storage.writeMeta: rename: %w", err)
	}
	return nil
}
