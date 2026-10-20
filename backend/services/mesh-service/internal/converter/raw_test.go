package converter

import (
	"bytes"
	"context"
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

// A tall model (long along the OBJ's Y) keeps Y as its tallest axis when the
// context marks the source Y-up; a territory-style conversion swaps it onto Z.
func TestConvertRawYUpSourceKeepsTheTallAxis(t *testing.T) {
	path := filepath.Join(t.TempDir(), "tall.obj")
	assert.NilError(t, os.WriteFile(path, []byte("v 0 0 0\nv 1 0 0\nv 0 5 0\nf 1 2 3\n"), 0o600))

	tests := []struct {
		name  string
		ctx   context.Context
		wantY float64
		wantZ float64
	}{
		{"model", WithYUpSource(t.Context()), 5, 0},
		{"territory", t.Context(), 0, 5},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			raw, err := (&Converter{}).convertRaw(tt.ctx, filepath.Dir(path), path)
			assert.NilError(t, err)
			assert.Equal(t, raw.bboxMax.Y-raw.bboxMin.Y, tt.wantY)
			assert.Equal(t, raw.bboxMax.Z-raw.bboxMin.Z, tt.wantZ)
		})
	}
}

// A territory's up axis is detected: Y thinnest means the source is Y-up and
// keeps its axes; otherwise it is swapped from Z-up. A model never swaps.
func TestConvertRawUpAxis(t *testing.T) {
	const (
		// A level rectangle plus one raised vertex: the plane normal is on the
		// up axis, so only the axis decision is under test, not levelling.
		yThin = "v 0 0 0\nv 10 0 0\nv 0 0 8\nv 10 0 8\nv 5 1 4\nf 1 2 3\nf 2 3 4\nf 3 4 5\n" // extents 10 x 1 x 8
		zThin = "v 0 0 0\nv 10 0 0\nv 0 8 0\nv 10 8 0\nv 5 4 1\nf 1 2 3\nf 2 3 4\nf 3 4 5\n" // extents 10 x 8 x 1
	)
	tests := []struct {
		name  string
		obj   string
		model bool
		want  [3]float64 // bbox extents in the output axes
	}{
		{"territory Y-thin keeps its axes", yThin, false, [3]float64{10, 1, 8}},
		{"territory Z-thin is swapped", zThin, false, [3]float64{10, 1, 8}},
		{"model Y-thin is never swapped", yThin, true, [3]float64{10, 1, 8}},
		{"model Z-thin is never swapped", zThin, true, [3]float64{10, 8, 1}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "m.obj")
			assert.NilError(t, os.WriteFile(path, []byte(tt.obj), 0o600))
			ctx := t.Context()
			if tt.model {
				ctx = WithYUpSource(ctx)
			}

			got, err := (&Converter{}).convertRaw(ctx, filepath.Dir(path), path)

			assert.NilError(t, err)
			ext := [3]float64{got.bboxMax.X - got.bboxMin.X, got.bboxMax.Y - got.bboxMin.Y, got.bboxMax.Z - got.bboxMin.Z}
			assert.Equal(t, ext, tt.want)
		})
	}
}
