package storage

import (
	"context"
	"encoding/json/v2"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// AppendChunk writes data at the given offset of the session's .data file.
// Rejects out-of-order writes (offset must equal the recorded offset) and
// writes that would exceed the session's declared size. The write position is
// explicit (WriteAt) and the file is cut to the new end, so bytes left by an
// earlier failed attempt are overwritten rather than duplicated; writers of
// one session are serialised, so a retried request cannot interleave.
func (f *FS) AppendChunk(_ context.Context, id string, offset int64, data []byte) (int64, error) {
	_, dataPath, metaPath, err := f.paths(id)
	if err != nil {
		return 0, err
	}
	defer f.lock(id)()

	meta, err := readMeta(metaPath)
	if err != nil {
		return 0, err
	}
	if offset != meta.Offset {
		return meta.Offset, fmt.Errorf("%w: have %d, got %d", domain.ErrOffsetMismatch, meta.Offset, offset)
	}
	if int64(len(data)) > meta.Size-meta.Offset {
		return meta.Offset, fmt.Errorf("%w: write would exceed declared size %d", domain.ErrSizeExceeded, meta.Size)
	}

	w, err := os.OpenFile(dataPath, os.O_CREATE|os.O_WRONLY, 0o600) //nolint:gosec // G304: dataPath comes from paths(), whose session id passed validateID (hex and dash only)
	if err != nil {
		return meta.Offset, fmt.Errorf("storage.AppendChunk: open: %w", err)
	}
	end := meta.Offset + int64(len(data))
	if _, err := w.WriteAt(data, meta.Offset); err != nil {
		_ = w.Close()
		return meta.Offset, fmt.Errorf("storage.AppendChunk: write: %w", err)
	}
	// Cut leftovers of an earlier, longer failed attempt.
	if err := w.Truncate(end); err != nil {
		_ = w.Close()
		return meta.Offset, fmt.Errorf("storage.AppendChunk: truncate: %w", err)
	}
	// Sync, then close, before advancing the offset: Close does not flush to
	// disk, so only Sync tells us the bytes are durable. An ENOSPC/EIO here
	// must fail the chunk; recording it as accepted would lose it silently,
	// as the client would never re-send it.
	if err := w.Sync(); err != nil {
		_ = w.Close()
		return meta.Offset, fmt.Errorf("storage.AppendChunk: sync: %w", err)
	}
	if err := w.Close(); err != nil {
		return meta.Offset, fmt.Errorf("storage.AppendChunk: close: %w", err)
	}

	// The offset advances only once the meta is durable; on failure the bytes
	// stay unrecorded and a retry from meta.Offset overwrites them.
	start := meta.Offset
	meta.Offset = end
	meta.UpdatedAt = time.Now().UTC()
	if err := writeMeta(metaPath, meta); err != nil {
		return start, err
	}
	return end, nil
}

func readMeta(path string) (domain.Session, error) {
	body, err := os.ReadFile(path) //nolint:gosec // G304: path comes from paths(), whose session id passed validateID (hex and dash only)
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
