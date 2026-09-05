package digest_test

import (
	"os"
	"path/filepath"
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/digest"
)

// The witness file is append-only and outlives the binary that wrote it, so
// lines produced by the encoding/json v1 writer must keep parsing after the
// package moved to encoding/json/v2. The two differ on nil slices, HTML
// escaping and omitempty, none of which this line shape can contain — but
// nothing else would notice if a future field reintroduced one, and a witness
// that stops parsing is an audit trail that stops verifying.
//
// The literals below are verbatim v1 output, escapes included.
func TestReadFileParsesV1WrittenLines(t *testing.T) {
	path := filepath.Join(t.TempDir(), "witness.jsonl")
	v1 := `{"id":7,"at":"2026-07-29T10:15:00Z","from_id":4120,"to_id":4187,"row_count":67,"digest":"beef","prev_digest":"41ab"}
{"id":8,"at":"2026-07-29T10:20:00Z","from_id":4187,"to_id":4187,"row_count":0,"digest":"\u003ccafe\u0026\u003e","prev_digest":"beef"}
`
	assert.NilError(t, os.WriteFile(path, []byte(v1), 0o600))

	got, err := digest.ReadFile(path)
	assert.NilError(t, err)
	assert.Equal(t, len(got), 2)
	assert.Equal(t, got[7], "beef")
	// v1 escaped <, & and > as \uXXXX; v2 must still decode them to the
	// original bytes or a digest comparison silently disagrees.
	assert.Equal(t, got[8], "<cafe&>")
}
