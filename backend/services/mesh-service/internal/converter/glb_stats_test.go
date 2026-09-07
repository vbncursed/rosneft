package converter

import (
	"os"
	"path/filepath"
	"testing"

	"gotest.tools/v3/assert"
)

// A GLB produced by the converter itself is the only fixture this package
// can build without checking a binary into the repo.
func writeOneTriangleGLB(t *testing.T) []byte {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "tri.obj")
	obj := "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"
	assert.NilError(t, os.WriteFile(path, []byte(obj), 0o600))

	c := &Converter{}
	raw, err := c.convertRaw(t.Context(), path)
	assert.NilError(t, err)
	return raw.content
}

func TestGLBStatsCountsPositionsAndTriangles(t *testing.T) {
	vertices, faces, err := glbStats(writeOneTriangleGLB(t))

	assert.NilError(t, err)
	assert.Equal(t, vertices, uint64(3))
	assert.Equal(t, faces, uint64(1))
}

func TestGLBStatsRejectsGarbage(t *testing.T) {
	_, _, err := glbStats([]byte("not a glb"))

	assert.Assert(t, err != nil)
}
