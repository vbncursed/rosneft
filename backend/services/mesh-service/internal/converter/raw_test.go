package converter

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// An OBJ the parser or the GLB writer rejects fails the same way on every
// retry, so it carries ErrBadSource; a file that cannot be opened is the
// worker's problem, not the upload's, and does not.
func TestConvertRawClassifiesFailures(t *testing.T) {
	tests := []struct {
		name       string
		obj        string
		missing    bool
		wantSource bool
	}{
		{"unparseable vertex", "v 0 x 0\n", false, true},
		{"face index out of range", "v 0 0 0\nf 1 2 3\n", false, true},
		{"no geometry", "# nothing here\n", false, true},
		{"file cannot be opened", "", true, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "m.obj")
			if !tt.missing {
				assert.NilError(t, os.WriteFile(path, []byte(tt.obj), 0o600))
			}

			_, err := (&Converter{}).convertRaw(t.Context(), filepath.Dir(path), path)

			assert.Assert(t, err != nil)
			assert.Equal(t, errors.Is(err, domain.ErrBadSource), tt.wantSource, "got %v", err)
		})
	}
}

// The root is what lets an MTL beside the OBJ's folder be found: the same OBJ
// converted with the extraction root picks up the material's colour, and with
// only its own folder as root the reference leaves the root and is ignored.
func TestConvertRawResolvesMaterialsInsideTheGivenRoot(t *testing.T) {
	upload := t.TempDir()
	assert.NilError(t, os.MkdirAll(filepath.Join(upload, "model"), 0o750))
	assert.NilError(t, os.MkdirAll(filepath.Join(upload, "mats"), 0o750))
	obj := "mtllib ../mats/m.mtl\nusemtl red\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"
	assert.NilError(t, os.WriteFile(filepath.Join(upload, "model", "m.obj"), []byte(obj), 0o600))
	assert.NilError(t, os.WriteFile(filepath.Join(upload, "mats", "m.mtl"), []byte("newmtl red\nKd 1 0 0\n"), 0o600))
	objPath := filepath.Join(upload, "model", "m.obj")
	const red = `"baseColorFactor":[1,0,0,1]`

	inRoot, err := (&Converter{}).convertRaw(t.Context(), upload, objPath)
	assert.NilError(t, err)
	narrow, err := (&Converter{}).convertRaw(t.Context(), filepath.Dir(objPath), objPath)
	assert.NilError(t, err)

	assert.Assert(t, bytes.Contains(inRoot.content, []byte(red)))
	assert.Assert(t, !bytes.Contains(narrow.content, []byte(red)))
}
