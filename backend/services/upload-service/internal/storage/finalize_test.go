package storage_test

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"testing"

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
