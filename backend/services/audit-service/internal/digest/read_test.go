package digest_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/digest"
)

// A line without a usable id or digest would be read as checkpoint 0 or as an
// empty digest, and Verify would then report a forged tail (or a mismatch) on
// a journal nobody touched. Reading must refuse it and name the line.
func TestReadFileRejectsUnusableLines(t *testing.T) {
	const good = `{"id":1,"digest":"aa"}`
	for _, tt := range []struct {
		name, bad string
	}{
		{"empty object", `{}`},
		{"no id", `{"digest":"x"}`},
		{"zero id", `{"id":0,"digest":"x"}`},
		{"negative id", `{"id":-3,"digest":"x"}`},
		{"no digest", `{"id":2}`},
		{"empty digest", `{"id":2,"digest":""}`},
	} {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "witness.jsonl")
			assert.NilError(t, os.WriteFile(path, []byte(good+"\n"+tt.bad+"\n"), 0o600))

			_, err := digest.ReadFile(path)
			assert.Assert(t, err != nil)
			assert.Assert(t, strings.Contains(err.Error(), "line 2"), err.Error())
		})
	}
}
