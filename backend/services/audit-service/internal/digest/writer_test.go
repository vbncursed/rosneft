package digest_test

import (
	"bufio"
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/digest"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

type WriterSuite struct{ suite.Suite }

func TestWriterSuite(t *testing.T) { suite.Run(t, new(WriterSuite)) }

func checkpoint(toID int64, dg string) domain.Checkpoint {
	return domain.Checkpoint{
		At:         time.Date(2026, 7, 29, 10, 15, 0, 0, time.UTC),
		FromID:     4120,
		ToID:       toID,
		RowCount:   67,
		Digest:     dg,
		PrevDigest: "41ab",
	}
}

func countLines(t *testing.T, b []byte) int {
	t.Helper()
	n := 0
	sc := bufio.NewScanner(bytes.NewReader(b))
	for sc.Scan() {
		n++
	}
	assert.NilError(t, sc.Err())
	return n
}

// An empty path disables the witness. Returning a nil writer that still accepts
// Write keeps the caller free of a branch on every tick.
func (s *WriterSuite) TestEmptyPathDisablesTheWitness() {
	w, err := digest.Open("")

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), w == nil)
	assert.NilError(s.T(), w.Write(checkpoint(4187, "9f2c")))
	assert.NilError(s.T(), w.Close())
}

func (s *WriterSuite) TestAppendsOneJSONLinePerCheckpoint() {
	path := filepath.Join(s.T().TempDir(), "digests.jsonl")

	w, err := digest.Open(path)
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), w.Write(checkpoint(4187, "9f2c")))
	assert.NilError(s.T(), w.Write(checkpoint(4200, "aa01")))
	assert.NilError(s.T(), w.Close())

	f, err := os.Open(path)
	assert.NilError(s.T(), err)
	defer func() { _ = f.Close() }()

	var got []map[string]any
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		var m map[string]any
		assert.NilError(s.T(), json.Unmarshal(sc.Bytes(), &m))
		got = append(got, m)
	}
	assert.NilError(s.T(), sc.Err())

	assert.Equal(s.T(), len(got), 2)
	assert.Equal(s.T(), got[0]["digest"], "9f2c")
	assert.Equal(s.T(), got[0]["to_id"], float64(4187))
	assert.Equal(s.T(), got[0]["row_count"], float64(67))
	assert.Equal(s.T(), got[1]["digest"], "aa01")
}

// Reopening must not truncate: the file is the witness, and a restart that
// wiped it would erase exactly the history it exists to protect.
func (s *WriterSuite) TestReopenAppends() {
	path := filepath.Join(s.T().TempDir(), "digests.jsonl")

	w1, err := digest.Open(path)
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), w1.Write(checkpoint(1, "one")))
	assert.NilError(s.T(), w1.Close())

	w2, err := digest.Open(path)
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), w2.Write(checkpoint(2, "two")))
	assert.NilError(s.T(), w2.Close())

	b, err := os.ReadFile(path)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), countLines(s.T(), b), 2)
}

func (s *WriterSuite) TestMissingDirectoryIsAnError() {
	_, err := digest.Open(filepath.Join(s.T().TempDir(), "nope", "digests.jsonl"))

	assert.Assert(s.T(), err != nil)
}
