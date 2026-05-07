package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// AppendChunk appends data at the given offset to the session's .data file.
// Rejects out-of-order writes (offset must equal current size) and writes
// that would exceed the session's declared size.
func (f *FS) AppendChunk(_ context.Context, id string, offset int64, data []byte) (int64, error) {
	_, dataPath, metaPath, err := f.paths(id)
	if err != nil {
		return 0, err
	}

	meta, err := readMeta(metaPath)
	if err != nil {
		return 0, err
	}
	if offset != meta.Offset {
		return meta.Offset, fmt.Errorf("%w: have %d, got %d", domain.ErrOffsetMismatch, meta.Offset, offset)
	}
	if meta.Offset+int64(len(data)) > meta.Size {
		return meta.Offset, fmt.Errorf("%w: write would exceed declared size %d", domain.ErrSizeExceeded, meta.Size)
	}

	w, err := os.OpenFile(dataPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return meta.Offset, fmt.Errorf("storage.AppendChunk: open: %w", err)
	}
	defer w.Close()
	n, err := w.Write(data)
	if err != nil {
		return meta.Offset + int64(n), fmt.Errorf("storage.AppendChunk: write: %w", err)
	}

	meta.Offset += int64(n)
	meta.UpdatedAt = time.Now().UTC()
	if err := writeMeta(metaPath, meta); err != nil {
		return meta.Offset, err
	}
	return meta.Offset, nil
}

func readMeta(path string) (domain.Session, error) {
	body, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return domain.Session{}, domain.ErrSessionNotFound
		}
		return domain.Session{}, fmt.Errorf("storage.readMeta: read: %w", err)
	}
	var s domain.Session
	if err := json.Unmarshal(body, &s); err != nil {
		return domain.Session{}, fmt.Errorf("storage.readMeta: unmarshal: %w", err)
	}
	return s, nil
}
