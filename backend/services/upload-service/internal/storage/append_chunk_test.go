package storage_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/storage"
)

const sessID = "a1b2c3d4e5f6a7b8c9d0e1f2"

func newSession(t *testing.T, size int64) (*storage.FS, string) {
	t.Helper()
	root := t.TempDir()
	fs, err := storage.NewFS(root)
	assert.NilError(t, err)
	_, err = fs.Initiate(t.Context(), sessID, owner1, size, "application/octet-stream")
	assert.NilError(t, err)
	return fs, filepath.Join(root, sessID)
}

func dataSize(t *testing.T, dir string) int64 {
	t.Helper()
	st, err := os.Stat(filepath.Join(dir, "data.bin"))
	if errors.Is(err, os.ErrNotExist) {
		return 0
	}
	assert.NilError(t, err)
	return st.Size()
}

// A retried PATCH racing the first one must not append twice: exactly one
// writer wins the offset and the file is as long as the meta says.
func TestAppendChunkConcurrentSameOffsetAppliesOnce(t *testing.T) {
	fs, dir := newSession(t, 64<<20)
	chunk := bytes.Repeat([]byte{'x'}, 4<<20)

	var ok atomic.Int32
	var wg sync.WaitGroup
	for range 16 {
		wg.Go(func() {
			if _, err := fs.AppendChunk(t.Context(), sessID, 0, chunk); err == nil {
				ok.Add(1)
			} else {
				assert.Assert(t, errors.Is(err, domain.ErrOffsetMismatch), "got %v", err)
			}
		})
	}
	wg.Wait()

	assert.Equal(t, ok.Load(), int32(1))
	assert.Equal(t, dataSize(t, dir), int64(len(chunk)))
	st, err := fs.GetStatus(t.Context(), sessID)
	assert.NilError(t, err)
	assert.Equal(t, st.Offset, int64(len(chunk)))
}

// A chunk whose bytes landed but whose offset was not recorded (meta write
// failed) is retried from the same offset: the retry overwrites, never appends.
func TestAppendChunkRetryAfterFailedMetaWriteOverwrites(t *testing.T) {
	fs, dir := newSession(t, 8)
	ctx := t.Context()

	// A directory squatting on the meta temp path makes writeMeta fail after the bytes are on disk.
	block := filepath.Join(dir, "meta.json.tmp")
	assert.NilError(t, os.Mkdir(block, 0o750))
	_, err := fs.AppendChunk(ctx, sessID, 0, []byte("AAAAAA"))
	assert.Assert(t, err != nil)
	st, err := fs.GetStatus(ctx, sessID)
	assert.NilError(t, err)
	assert.Equal(t, st.Offset, int64(0))
	assert.NilError(t, os.Remove(block))

	off, err := fs.AppendChunk(ctx, sessID, 0, []byte("BBBB"))
	assert.NilError(t, err)
	assert.Equal(t, off, int64(4))
	off, err = fs.AppendChunk(ctx, sessID, 4, []byte("CCCC"))
	assert.NilError(t, err)
	assert.Equal(t, off, int64(8))

	var got bytes.Buffer
	_, _, err = fs.Finalize(ctx, sessID, func(_ context.Context, _ string, r io.Reader) error {
		_, err := io.Copy(&got, r)
		return err
	})
	assert.NilError(t, err)
	assert.Equal(t, got.String(), "BBBBCCCC")
}

func TestAppendChunkOverSizeIsRejectedAndWritesNothing(t *testing.T) {
	fs, dir := newSession(t, 4)
	_, err := fs.AppendChunk(t.Context(), sessID, 0, []byte("12345"))
	assert.Assert(t, errors.Is(err, domain.ErrSizeExceeded), "got %v", err)
	assert.Equal(t, dataSize(t, dir), int64(0))
}
