package converter

import (
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

			_, err := (&Converter{}).convertRaw(t.Context(), path)

			assert.Assert(t, err != nil)
			assert.Equal(t, errors.Is(err, domain.ErrBadSource), tt.wantSource, "got %v", err)
		})
	}
}
