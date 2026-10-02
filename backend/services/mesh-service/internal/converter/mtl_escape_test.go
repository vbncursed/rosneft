package converter

import (
	"os"
	"path/filepath"
	"testing"

	"gotest.tools/v3/assert"
)

// mtllib and texture paths come out of the uploaded OBJ/MTL, so they are as
// untrusted as a zip entry name: neither may reach a file outside the OBJ's
// own directory.
func TestLoadMTLRefusesAPathOutsideTheOBJDirectory(t *testing.T) {
	root := t.TempDir()
	objDir := filepath.Join(root, "bundle")
	assert.NilError(t, os.Mkdir(objDir, 0o750))
	assert.NilError(t, os.WriteFile(filepath.Join(root, "outside.mtl"), []byte("newmtl leaked\nKd 1 0 0\n"), 0o600))

	got := loadMTL(t.Context(), objDir, "../outside.mtl", filepath.Join(objDir, "m.obj"))

	assert.Equal(t, len(got), 0)
}

func TestLoadMTLStillReadsASubdirectory(t *testing.T) {
	objDir := t.TempDir()
	assert.NilError(t, os.Mkdir(filepath.Join(objDir, "mats"), 0o750))
	assert.NilError(t, os.WriteFile(filepath.Join(objDir, "mats", "a.mtl"), []byte("newmtl kept\nKd 1 0 0\n"), 0o600))

	got := loadMTL(t.Context(), objDir, "mats/a.mtl", filepath.Join(objDir, "m.obj"))

	_, ok := got["kept"]
	assert.Assert(t, ok)
}

func TestLoadTextureRefusesAPathOutsideTheOBJDirectory(t *testing.T) {
	root := t.TempDir()
	objDir := filepath.Join(root, "bundle")
	assert.NilError(t, os.Mkdir(objDir, 0o750))
	assert.NilError(t, os.WriteFile(filepath.Join(root, "outside.png"), []byte("png"), 0o600))

	got := loadTexture(t.Context(), objDir, "../outside.png", map[string]*textureAsset{})

	assert.Assert(t, got == nil)
}
