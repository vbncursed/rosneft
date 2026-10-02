package converter

import (
	"os"
	"path/filepath"
	"testing"

	"gotest.tools/v3/assert"
)

// bundle lays out an extraction: root/model/m.obj beside root/textures, with
// a file outside root that no reference may reach.
func bundle(t *testing.T) (root *os.Root, objRel, outside string) {
	t.Helper()
	parent := t.TempDir()
	rootDir := filepath.Join(parent, "work")
	assert.NilError(t, os.MkdirAll(filepath.Join(rootDir, "model"), 0o750))
	assert.NilError(t, os.MkdirAll(filepath.Join(rootDir, "textures"), 0o750))
	r, err := os.OpenRoot(rootDir)
	assert.NilError(t, err)
	t.Cleanup(func() { _ = r.Close() })
	return r, "model", parent
}

func write(t *testing.T, path, body string) {
	t.Helper()
	assert.NilError(t, os.WriteFile(path, []byte(body), 0o600))
}

// mtllib and texture paths come out of the uploaded OBJ/MTL, so they are as
// untrusted as a zip entry name: none may reach a file outside the extraction.
func TestLoadMTLRefusesAPathOutsideTheRoot(t *testing.T) {
	root, objRel, outside := bundle(t)
	write(t, filepath.Join(outside, "outside.mtl"), "newmtl leaked\nKd 1 0 0\n")

	got := loadMTL(t.Context(), root, objRel, "../../outside.mtl", "model/m.obj")

	assert.Equal(t, len(got), 0)
}

func TestLoadMTLReadsASiblingFolderAndASubdirectory(t *testing.T) {
	root, objRel, _ := bundle(t)
	write(t, filepath.Join(root.Name(), "textures", "a.mtl"), "newmtl sibling\nKd 1 0 0\n")
	assert.NilError(t, os.Mkdir(filepath.Join(root.Name(), "model", "mats"), 0o750))
	write(t, filepath.Join(root.Name(), "model", "mats", "b.mtl"), "newmtl nested\nKd 1 0 0\n")

	_, ok := loadMTL(t.Context(), root, objRel, "../textures/a.mtl", "model/m.obj")["sibling"]
	assert.Assert(t, ok)
	_, ok = loadMTL(t.Context(), root, objRel, "mats/b.mtl", "model/m.obj")["nested"]
	assert.Assert(t, ok)
}

func TestLoadTextureRefusesAPathOutsideTheRoot(t *testing.T) {
	root, objRel, outside := bundle(t)
	write(t, filepath.Join(outside, "outside.png"), "png")

	got := loadTexture(t.Context(), root, objRel, "../../outside.png", map[string]*textureAsset{})

	assert.Assert(t, got == nil)
}

// A bundle may keep its textures beside the OBJ's folder ("model/m.obj" ->
// "../textures/x.png"); that stays inside the extraction root and must load.
func TestLoadTextureReadsASiblingFolder(t *testing.T) {
	root, objRel, _ := bundle(t)
	write(t, filepath.Join(root.Name(), "textures", "x.png"), "png")

	got := loadTexture(t.Context(), root, objRel, "../textures/x.png", map[string]*textureAsset{})

	assert.Assert(t, got != nil)
}

func TestLoadTextureRefusesASymlinkOutOfTheRoot(t *testing.T) {
	root, objRel, outside := bundle(t)
	write(t, filepath.Join(outside, "secret.png"), "png")
	assert.NilError(t, os.Symlink(filepath.Join(outside, "secret.png"), filepath.Join(root.Name(), "model", "link.png")))

	got := loadTexture(t.Context(), root, objRel, "link.png", map[string]*textureAsset{})

	assert.Assert(t, got == nil)
}
