package blobstore

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gotest.tools/v3/assert"
)

// The blob volume is read and written by one uid (nonroot in every service
// image), so a shard directory and its metadata sidecar need no access for
// anyone else.
func TestPutKeepsShardAndMetaPrivate(t *testing.T) {
	root := t.TempDir()
	store, err := NewFS(filepath.Join(root, "blobs"))
	assert.NilError(t, err)

	hash := strings.Repeat("ab", 32)
	_, err = store.Put(t.Context(), hash, "text/plain", strings.NewReader("x"))
	assert.NilError(t, err)

	shard := filepath.Join(root, "blobs", "ab")
	for path, other := range map[string]os.FileMode{
		filepath.Join(root, "blobs"):       0o007,
		shard:                              0o007,
		filepath.Join(shard, hash+".bin"):  0o077,
		filepath.Join(shard, hash+".json"): 0o077,
	} {
		info, err := os.Stat(path)
		assert.NilError(t, err)
		assert.Equal(t, info.Mode().Perm()&other, os.FileMode(0), path)
	}
}
