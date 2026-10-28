package storage_test

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

func TestFinalizeRefusesWhenFileSizeDiffersFromMeta(t *testing.T) {
	fs, dir := newSession(t, 4)
	_, err := fs.AppendChunk(t.Context(), sessID, 0, []byte("abcd"))
	assert.NilError(t, err)
	f, err := os.OpenFile(filepath.Join(dir, "data.bin"), os.O_WRONLY|os.O_APPEND, 0o600)
	assert.NilError(t, err)
	_, err = f.WriteString("junk")
	assert.NilError(t, err)
	assert.NilError(t, f.Close())

	called := false
	_, _, err = fs.Finalize(t.Context(), sessID, func(context.Context, string, io.Reader) error {
		called = true
		return nil
	})
	assert.Assert(t, errors.Is(err, domain.ErrInvalidInput), "got %v", err)
	assert.Assert(t, !called, "a blob of the wrong size must not be published")
}

func acceptAll(_ context.Context, _ string, r io.Reader) error {
	_, err := io.Copy(io.Discard, r)
	return err
}

func TestFinalizeTransientPutFailureKeepsSessionResumable(t *testing.T) {
	fs, _ := newSession(t, 4)
	ctx := t.Context()
	_, err := fs.AppendChunk(ctx, sessID, 0, []byte("abcd"))
	assert.NilError(t, err)

	_, _, err = fs.Finalize(ctx, sessID, func(context.Context, string, io.Reader) error {
		return errors.New("blob store down")
	})
	assert.Assert(t, err != nil)

	st, err := fs.GetStatus(ctx, sessID)
	assert.NilError(t, err)
	assert.Equal(t, st.Offset, int64(4))
	_, size, err := fs.Finalize(ctx, sessID, acceptAll)
	assert.NilError(t, err)
	assert.Equal(t, size, int64(4))
	_, err = fs.GetStatus(ctx, sessID)
	assert.Assert(t, errors.Is(err, domain.ErrSessionNotFound))
}

func TestFinalizePermanentRejectionRemovesSession(t *testing.T) {
	fs, _ := newSession(t, 4)
	ctx := t.Context()
	_, err := fs.AppendChunk(ctx, sessID, 0, []byte("abcd"))
	assert.NilError(t, err)

	_, _, err = fs.Finalize(ctx, sessID, func(context.Context, string, io.Reader) error {
		return fmt.Errorf("%w: not a PDF", domain.ErrInvalidInput)
	})
	assert.Assert(t, errors.Is(err, domain.ErrInvalidInput))
	_, err = fs.GetStatus(ctx, sessID)
	assert.Assert(t, errors.Is(err, domain.ErrSessionNotFound))
}

// Abort waits for a running Finalize instead of unlinking the file under it:
// the finalize result stands, and only then is the session gone.
func TestAbortWaitsForFinalize(t *testing.T) {
	fs, _ := newSession(t, 4)
	_, err := fs.AppendChunk(t.Context(), sessID, 0, []byte("abcd"))
	assert.NilError(t, err)

	inPut, release := make(chan struct{}), make(chan struct{})
	finErr := make(chan error, 1)
	go func() {
		_, _, err := fs.Finalize(t.Context(), sessID, func(ctx context.Context, h string, r io.Reader) error {
			close(inPut)
			<-release
			return acceptAll(ctx, h, r)
		})
		finErr <- err
	}()
	<-inPut

	abortErr := make(chan error, 1)
	go func() { abortErr <- fs.Abort(t.Context(), sessID) }()
	select {
	case err := <-abortErr:
		t.Fatalf("Abort returned while Finalize was publishing: %v", err)
	case <-time.After(100 * time.Millisecond):
	}

	close(release)
	assert.NilError(t, <-finErr)
	assert.NilError(t, <-abortErr)
	_, err = fs.GetStatus(t.Context(), sessID)
	assert.Assert(t, errors.Is(err, domain.ErrSessionNotFound), "got %v", err)
}

// Abort racing AppendChunk must leave no session directory behind (an unlocked
// RemoveAll races the chunk's O_CREATE and fails with "directory not empty").
func TestAbortConcurrentWithAppendChunkLeavesNothing(t *testing.T) {
	for range 50 {
		fs, dir := newSession(t, 1<<20)
		chunk := bytes.Repeat([]byte{'x'}, 256<<10)
		var wg sync.WaitGroup
		for i := range 4 {
			wg.Go(func() { _, _ = fs.AppendChunk(t.Context(), sessID, int64(i)*int64(len(chunk)), chunk) })
		}
		var abortErr error
		wg.Go(func() { abortErr = fs.Abort(t.Context(), sessID) })
		wg.Wait()

		assert.NilError(t, abortErr)
		_, err := os.Stat(dir)
		assert.Assert(t, errors.Is(err, os.ErrNotExist), "session dir survived Abort: %v", err)
	}
}
