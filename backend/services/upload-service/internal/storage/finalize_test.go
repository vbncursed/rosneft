package storage_test

import (
	"context"
	"errors"
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
