package storage_test

import (
	"os"
	"path/filepath"
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/storage"
)

// An upload in flight when the service restarts is resumed from its .json
// sidecar, so a sidecar written by the encoding/json v1 build must still load
// after the package moved to encoding/json/v2. Failing this drops every
// partially uploaded file at deploy time — and the client's next PATCH would
// look like a fresh session rather than an error.
//
// The literal is verbatim v1 output; contentType carries the characters v1
// escaped and v2 does not, since it comes straight from the client's header.
func TestGetStatusReadsV1WrittenMeta(t *testing.T) {
	root := t.TempDir()
	id := "a1b2c3d4e5f6a7b8c9d0e1f2"
	dir := filepath.Join(root, id)
	assert.NilError(t, os.MkdirAll(dir, 0o755))
	v1 := `{"ID":"a1b2c3d4e5f6a7b8c9d0e1f2","Size":4096,"Offset":1024,` +
		`"ContentType":"model/gltf-binary;q=\u003c1\u0026\u003e",` +
		`"CreatedAt":"2026-09-02T10:00:00Z","UpdatedAt":"2026-09-02T10:05:00Z"}`
	assert.NilError(t, os.WriteFile(filepath.Join(dir, "meta.json"), []byte(v1), 0o644))
	assert.NilError(t, os.WriteFile(filepath.Join(dir, "data.bin"), make([]byte, 1024), 0o644))

	fs, err := storage.NewFS(root)
	assert.NilError(t, err)
	got, err := fs.GetStatus(t.Context(), id)
	assert.NilError(t, err)
	assert.Equal(t, got.ID, id)
	assert.Equal(t, got.Size, int64(4096))
	assert.Equal(t, got.Offset, int64(1024))
	assert.Equal(t, got.ContentType, "model/gltf-binary;q=<1&>")
}
